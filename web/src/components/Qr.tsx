import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

const SITE = 'https://fire-rings.vercel.app'

export default function Qr() {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { QRCode.toDataURL(SITE, { margin: 1, width: 220, color: { dark: '#0A0E14', light: '#E8EEF5' } }).then(setSrc).catch(() => setSrc(null)) }, [])
  return src ? <figure className="flex flex-col items-center gap-2"><img src={src} width={180} height={180} alt={`QR code for ${SITE}`} className="rounded-sm" /><figcaption className="num text-sm text-muted">{SITE.replace('https://', '')}</figcaption></figure> : null
}
