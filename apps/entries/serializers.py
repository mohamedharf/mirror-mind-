from rest_framework import serializers
from .models import Entry, Metric, MetricDefinition


class MetricDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetricDefinition
        fields = ['name', 'unit', 'category']


class MetricSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='definition.name', read_only=True)
    unit = serializers.CharField(source='definition.unit', read_only=True)

    class Meta:
        model = Metric
        fields = ['id', 'name', 'unit', 'value', 'recorded_at']


class EntryChildSerializer(serializers.ModelSerializer):
    """Serializer مبسط للأبناء — يمنع nesting لا نهائي"""
    class Meta:
        model = Entry
        fields = ['id', 'text', 'created_at', 'mood_score',
                  'tags', 'processing_status', 'is_open_event']


class EntrySerializer(serializers.ModelSerializer):
    metrics  = MetricSerializer(many=True, read_only=True)
    children = EntryChildSerializer(many=True, read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(
        source='parent',
        queryset=Entry.objects.all(),
        allow_null=True,
        required=False
    )

    class Meta:
        model = Entry
        fields = [
            'id', 'text', 'created_at', 'updated_at', 'parent_id',
            'mood_score', 'tags', 'entities', 'ai_reflection',
            'entry_type', 'is_open_event', 'processing_status',
            'metrics', 'children'
        ]
        read_only_fields = [
            'user', 'processing_status', 'mood_score',
            'tags', 'entities', 'ai_reflection',
            'entry_type', 'is_open_event', 'metrics', 'children'
        ]

    def validate_parent_id(self, parent):
        """
        يمنع thread depth > 1.
        يمنع الربط بإدخال من مستخدم آخر.
        """
        if parent is None:
            return parent

        # منع depth > 1
        if parent.parent_id is not None:
            raise serializers.ValidationError(
                "لا يمكن الربط بإدخال هو نفسه تابع. الحد الأقصى للعمق مستوى واحد."
            )

        # منع الربط بإدخال من مستخدم آخر
        request = self.context.get('request')
        if request and parent.user_id != request.user.id:
            raise serializers.ValidationError("إدخال غير موجود.")

        return parent
