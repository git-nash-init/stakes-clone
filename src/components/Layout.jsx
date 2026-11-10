import { useCallback, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import MobileNavigation from './MobileNavigation'

function Layout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const mobileMenuButtonRef = useRef(null)
    const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), [])

    return (
        <div className="app-layout">
            <Sidebar
                isOpen={isSidebarOpen}
                toggleSidebar={() => setIsSidebarOpen(value => !value)}
            />
            <div className="app-main-wrapper">
                <Header
                    menuOpen={isMobileMenuOpen}
                    menuButtonRef={mobileMenuButtonRef}
                    onMenuClick={() => setIsMobileMenuOpen(true)}
                />
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
            <MobileNavigation
                drawerOpen={isMobileMenuOpen}
                onClose={closeMobileMenu}
                onOpen={() => setIsMobileMenuOpen(true)}
                returnFocusRef={mobileMenuButtonRef}
            />
        </div>
    )
}

export default Layout
