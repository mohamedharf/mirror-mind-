import { useState, useRef } from 'react'
import api from '../lib/api'

export default function VoiceButton({ onTranscribed, onError }) {
  const [state, setState] = useState('idle') // idle | recording | processing
  const [duration, setDuration] = useState(0)
  const mediaRecorder = useRef(null)
  const chunks        = useRef([])
  const timer         = useRef(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.current = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunks.current = []

      mediaRecorder.current.ondataavailable = (e) => chunks.current.push(e.data)
      mediaRecorder.current.onstop = handleStop

      mediaRecorder.current.start()
      setState('recording')
      setDuration(0)
      timer.current = setInterval(() => setDuration(d => d + 1), 1000)

      // حد أقصى 60 ثانية
      setTimeout(() => {
        if (mediaRecorder.current?.state === 'recording') stopRecording()
      }, 60000)
    } catch {
      onError?.('لا يمكن الوصول للميكروفون')
    }
  }

  const stopRecording = () => {
    clearInterval(timer.current)
    mediaRecorder.current?.stop()
    mediaRecorder.current?.stream.getTracks().forEach(t => t.stop())
  }

  const handleStop = async () => {
    setState('processing')
    const blob = new Blob(chunks.current, { type:'audio/webm' })
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')

    try {
      const { data } = await api.post('/audio/transcribe/', form)
      onTranscribed(data.text, data.confidence)
    } catch {
      onError?.('فشل التحويل — حاول مجدداً')
    } finally {
      setState('idle')
    }
  }

  const toggle = () => state === 'idle' ? startRecording() : stopRecording()

  const formatDuration = (s) =>
    `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <button
        onClick={toggle}
        className={state === 'recording' ? 'pulse-recording' : ''}
        style={{
          width:48, height:48, borderRadius:'50%',
          border:`1.5px solid ${state === 'recording' ? 'var(--mood-low)' : 'var(--border)'}`,
          background: state === 'recording' ? 'rgba(224,92,92,0.15)' : 'var(--bg-surface)',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          transition: 'all 200ms',
        }}
      >
        {state === 'processing'
          ? <Spinner />
          : <MicIcon active={state === 'recording'} />}
      </button>

      {state === 'recording' && (
        <span className="animate-fade-in"
          style={{ fontSize:13, color:'var(--mood-low)' }}>
          🎙 {formatDuration(duration)}
        </span>
      )}

      {state === 'processing' && (
        <span className="animate-fade-in"
          style={{ fontSize:13, color:'var(--text-muted)' }}>
          جارٍ التحويل...
        </span>
      )}
    </div>
  )
}

const MicIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--mood-low)' : 'var(--text-secondary)'}
    strokeWidth="2" strokeLinecap="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8"  y1="23" x2="16" y2="23"/>
  </svg>
)

const Spinner = () => (
  <div style={{
    width:18, height:18, border:'2px solid var(--border)',
    borderTop:'2px solid var(--primary)', borderRadius:'50%',
    animation:'spin 0.8s linear infinite',
  }}/>
)
