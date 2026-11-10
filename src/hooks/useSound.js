import { useEffect, useSyncExternalStore } from 'react'
import {
    isSoundMuted,
    playSound,
    preloadSounds,
    subscribeSoundMuted,
    toggleSoundMuted,
} from '../utils/soundManager'

export function useSound(names = []) {
    const muted = useSyncExternalStore(subscribeSoundMuted, isSoundMuted, () => false)
    const key = names.join(',')

    useEffect(() => {
        preloadSounds(key ? key.split(',') : [])
    }, [key])

    return { play: playSound, muted, toggleMuted: toggleSoundMuted }
}
