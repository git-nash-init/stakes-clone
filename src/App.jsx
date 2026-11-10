import { lazy, Suspense } from 'react'
import { Navigate, Routes, Route } from 'react-router-dom'
import { App as AntApp } from 'antd'
import Layout from './components/Layout'

const HomePage = lazy(() => import('./pages/HomePage'))
const CrashPage = lazy(() => import('./pages/CrashPage'))
const PlinkoPage = lazy(() => import('./pages/PlinkoPage'))
const DinoPage = lazy(() => import('./pages/DinoPage'))
const MinesPage = lazy(() => import('./pages/MinesPage'))
const DicePage = lazy(() => import('./pages/DicePage'))
const LimboPage = lazy(() => import('./pages/LimboPage'))
const KenoPage = lazy(() => import('./pages/KenoPage'))
const HiLoPage = lazy(() => import('./pages/HiLoPage'))
const BlackjackPage = lazy(() => import('./pages/BlackjackPage'))
const RoulettePage = lazy(() => import('./pages/RoulettePage'))

function App() {
    return (
        <AntApp>
            <Suspense
                fallback={
                    <div className="route-loading" role="status" aria-live="polite">
                        Loading…
                    </div>
                }
            >
                <Routes>
                    <Route path="/" element={<Layout />}>
                        <Route index element={<HomePage />} />
                        <Route path="crash" element={<CrashPage />} />
                        <Route path="plinko" element={<PlinkoPage />} />
                        <Route path="dino" element={<DinoPage />} />
                        <Route path="mines" element={<MinesPage />} />
                        <Route path="dice" element={<DicePage />} />
                        <Route path="limbo" element={<LimboPage />} />
                        <Route path="keno" element={<KenoPage />} />
                        <Route path="hilo" element={<HiLoPage />} />
                        <Route path="blackjack" element={<BlackjackPage />} />
                        <Route path="roulette" element={<RoulettePage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </Suspense>
        </AntApp>
    )
}

export default App


