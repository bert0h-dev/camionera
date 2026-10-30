import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { CameraOff } from 'lucide-react'

interface Detector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector

/**
 * Lector de QR con la cámara trasera. Usa BarcodeDetector (nativo en Chrome de Android) y,
 * si el navegador no lo tiene, jsQR sobre un canvas. Ignora el mismo código por unos segundos.
 */
export function QrScanner({ onCode, paused }: { onCode: (code: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(() =>
    navigator.mediaDevices ? null : 'Este navegador no permite usar la cámara; escribe el folio.',
  )
  const last = useRef<{ code: string; at: number } | null>(null)
  // El ciclo de lectura vive en un efecto: lee lo último de estas props sin reiniciar la cámara
  const pausedRef = useRef(paused)
  const onCodeRef = useRef(onCode)
  useEffect(() => {
    pausedRef.current = paused
    onCodeRef.current = onCode
  }, [paused, onCode])

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
    const detector = Native ? new Native({ formats: ['qr_code'] }) : null

    const found = (code: string) => {
      const now = Date.now()
      if (last.current && last.current.code === code && now - last.current.at < 4000) return
      last.current = { code, at: now }
      onCodeRef.current(code)
    }

    const tick = async () => {
      const v = video.current
      if (stopped || !v) return
      if (!pausedRef.current && v.readyState >= 2) {
        try {
          if (detector) {
            const [hit] = await detector.detect(v)
            if (hit?.rawValue) found(hit.rawValue)
          } else if (ctx) {
            canvas.width = v.videoWidth
            canvas.height = v.videoHeight
            ctx.drawImage(v, 0, 0)
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
            if (hit?.data) found(hit.data)
          }
        } catch {
          // Un cuadro que no se pudo leer no detiene el lector
        }
      }
      timer = window.setTimeout(() => void tick(), 250)
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        void tick()
      })
      .catch(() => setError('No se pudo abrir la cámara. Revisa el permiso del navegador o escribe el folio.'))

    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  if (error)
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-surface-sunken p-6 text-center text-sm text-fg-muted">
        <CameraOff className="size-8" />
        {error}
      </div>
    )
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
      <video ref={video} className="size-full object-cover" muted playsInline />
      {/* Guía de encuadre */}
      <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-amber-400/80" />
      {paused && <div className="absolute inset-0 bg-black/40" />}
    </div>
  )
}
