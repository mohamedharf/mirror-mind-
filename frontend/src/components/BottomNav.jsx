import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/',         icon: 'edit',      label: 'كتابة'   },
  { to: '/history',  icon: 'history',   label: 'سجل'     },
  { to: '/habits',   icon: 'loop',      label: 'عادات'   },
  { to: '/insights', icon: 'analytics', label: 'تحليل'   },
  { to: '/settings', icon: 'tune',      label: 'إعدادات' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex flex-row-reverse justify-around items-center bg-bg-surface border-t border-border"
      style={{ height: 72 }}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex-1 h-full flex flex-col items-center justify-center transition-colors relative
              ${isActive ? 'text-primary' : 'text-text-muted hover:text-text-secondary'}`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[40px] h-[2px] bg-primary rounded-b-sm" />
              )}
              <span
                className="material-symbols-outlined mb-1"
                style={{ fontVariationSettings: isActive ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400", fontSize: 22 }}
              >
                {item.icon}
              </span>
              <span className="font-medium text-[11px] leading-none">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
