from django.db import models
from django.conf import settings


class MetricDefinition(models.Model):
    """
    تعريفات الكميات القابلة للقياس.
    هجين: system (seed + promoted) + user-generated (pending)
    """
    name = models.CharField(max_length=50, unique=True)
    unit = models.CharField(max_length=20)
    category = models.CharField(
        max_length=15,
        choices=[
            ('health',    'صحة'),
            ('habit',     'عادة'),
            ('activity',  'نشاط'),
            ('nutrition', 'تغذية'),
        ]
    )
    aliases = models.JSONField(default=list)
    is_system = models.BooleanField(default=False)
    suggested_by_count = models.IntegerField(default=0)
    promoted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.unit})"


class MetricDefinitionContributor(models.Model):
    """
    يسجل كل مستخدم استخدم metric معين — مرة واحدة لكل مستخدم/metric.
    suggested_by_count = عدد الصفوف الفريدة هنا لكل definition.
    """
    definition = models.ForeignKey(
        MetricDefinition,
        on_delete=models.CASCADE,
        related_name='contributors'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='metric_contributions'
    )
    first_used = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['definition', 'user']]


class Entry(models.Model):
    # ── علاقات ────────────────────────────────────
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='entries'
    )
    parent = models.ForeignKey(
        'self',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='children'
    )
    # ⚠️ max depth = 1: يتحقق منه في EntrySerializer.validate_parent_id

    # ── المحتوى ───────────────────────────────────
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ── بيانات LLM ────────────────────────────────
    mood_score = models.FloatField(null=True, blank=True)
    tags = models.JSONField(default=list)
    entities = models.JSONField(default=dict)
    ai_reflection = models.TextField(blank=True)

    entry_type = models.CharField(
        max_length=15,
        choices=[
            ('routine',    'اعتيادي متكرر'),
            ('event',      'حدث طارئ'),
            ('reflection', 'تأمل'),
        ],
        default='event'
    )

    is_open_event = models.BooleanField(default=False)

    processing_status = models.CharField(
        max_length=15,
        choices=[
            ('pending',      'Pending'),
            ('processing',   'Processing'),
            ('done',         'Done'),
            ('failed',       'Failed'),
            ('rate_limited', 'Rate Limited'),
        ],
        default='pending'
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['user', 'created_at', 'processing_status']),
            models.Index(fields=['user', 'parent']),
            models.Index(fields=['user', 'processing_status']),
            # فهرس مركّب لاستعلام "أحداث اليوم" الشائع
            models.Index(
                fields=['user', 'created_at'],
                name='entries_user_date_idx'
            ),
        ]

    def __str__(self):
        return f"Entry by {self.user} on {self.created_at.strftime('%Y-%m-%d')}"

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)

        if is_new and self.parent_id and self.parent.is_open_event:
            # إغلاق الحدث المفتوح
            duration_hours = (self.created_at - self.parent.created_at).total_seconds() / 3600.0
            
            # البحث عن المقياس المناسب (مثل "نوم" أو "عمل") من تاجز الأب
            parent_tags = self.parent.tags or []
            target_def = None
            for tag in parent_tags:
                tag_lower = tag.lower()
                target_def = MetricDefinition.objects.filter(models.Q(name=tag_lower) | models.Q(aliases__contains=[tag_lower])).first()
                if target_def:
                    break
            
            if target_def:
                Metric.objects.create(
                    user=self.user,
                    entry=self.parent,  # نربط المقياس بالأب (بداية الحدث)
                    definition=target_def,
                    value=round(duration_hours, 2),
                    recorded_at=self.created_at
                )


class Metric(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='metrics'
    )
    entry = models.ForeignKey(
        Entry,
        on_delete=models.CASCADE,
        related_name='metrics'
    )
    definition = models.ForeignKey(
        MetricDefinition,
        on_delete=models.PROTECT,
        related_name='measurements'
    )
    value = models.FloatField()
    recorded_at = models.DateTimeField()

    class Meta:
        indexes = [
            models.Index(fields=['user', 'definition', 'recorded_at']),
            models.Index(fields=['user', 'recorded_at']),
            # فهرس لاستعلامات الـ baseline الأسبوعية
            models.Index(
                fields=['user', 'definition', 'recorded_at'],
                name='metrics_user_def_date_idx'
            ),
        ]

    def __str__(self):
        return f"{self.definition.name}: {self.value} ({self.user})"


class MetricBaseline(models.Model):
    """
    المعدل الطبيعي للمستخدم — يُحسب SQL كل أحد من آخر 30 يوم.
    صفر LLM.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='baselines'
    )
    definition = models.ForeignKey(
        MetricDefinition,
        on_delete=models.CASCADE,
        related_name='baselines'
    )
    daily_avg = models.FloatField()
    daily_min = models.FloatField()
    daily_max = models.FloatField()
    sample_days = models.IntegerField()
    last_updated = models.DateField(auto_now=True)

    class Meta:
        unique_together = [['user', 'definition']]

    def __str__(self):
        return f"Baseline {self.definition.name} for {self.user}: avg={self.daily_avg}"
