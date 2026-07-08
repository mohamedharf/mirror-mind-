import BottomNav from './BottomNav'
import { OfflineBanner } from './OfflineBanner'

export default function Layout({ children }) {
  return (
    <div className="bg-bg-deep text-text-primary min-h-screen pb-24">
      <OfflineBanner />
      {children}
      <BottomNav />
    </div>
  )
}
