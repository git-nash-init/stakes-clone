import { createContext, useContext, useState, useCallback, useRef } from 'react'

const WalletContext = createContext(null)

const INITIAL_BALANCE = 1000.00
const STORAGE_KEY = 'stake_wallet_balance'

function getStoredBalance() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored !== null) {
            const parsed = parseFloat(stored)
            return isNaN(parsed) ? INITIAL_BALANCE : parsed
        }
    } catch (e) { /* ignore */ }
    return INITIAL_BALANCE
}

export function WalletProvider({ children }) {
    const [balance, setBalance] = useState(getStoredBalance)
    const balanceRef = useRef(balance)
    const [currency, setCurrency] = useState('USD')
    const [transactions, setTransactions] = useState([])

    // Toast system
    const [toasts, setToasts] = useState([])
    const toastIdRef = useRef(0)
    const transactionIdRef = useRef(0)

    const showToast = useCallback((type, title, description, duration = 3000) => {
        const id = ++toastIdRef.current
        setToasts(prev => [...prev, { id, type, title, description }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)
    }, [])

    const setStoredBalance = useCallback((nextBalance) => {
        const rounded = parseFloat(nextBalance.toFixed(2))
        balanceRef.current = rounded
        setBalance(rounded)
        try { localStorage.setItem(STORAGE_KEY, rounded.toString()) } catch (e) { /* ignore */ }
        return rounded
    }, [])

    // Update balance and persist to localStorage
    const updateBalance = useCallback((newBalance) => {
        setStoredBalance(newBalance)
    }, [setStoredBalance])

    // Place a bet (deduct from balance)
    const placeBet = useCallback((amount) => {
        const amt = parseFloat(amount)
        if (isNaN(amt) || amt <= 0 || amt > balanceRef.current) return false

        const newBal = setStoredBalance(balanceRef.current - amt)
        setTransactions(txs => [{
            id: ++transactionIdRef.current,
            type: 'bet',
            amount: -amt,
            balance: newBal,
            timestamp: new Date(),
        }, ...txs].slice(0, 100))

        return true
    }, [setStoredBalance])

    // Add winnings to balance
    const addWinnings = useCallback((amount) => {
        const amt = parseFloat(amount)
        if (isNaN(amt) || amt <= 0) return

        const newBal = setStoredBalance(balanceRef.current + amt)
        setTransactions(txs => [{
            id: ++transactionIdRef.current,
            type: 'win',
            amount: amt,
            balance: newBal,
            timestamp: new Date(),
        }, ...txs].slice(0, 100))
    }, [setStoredBalance])

    // Deposit funds
    const deposit = useCallback((amount) => {
        const amt = parseFloat(amount)
        if (isNaN(amt) || amt <= 0) return

        const newBal = setStoredBalance(balanceRef.current + amt)
        setTransactions(txs => [{
            id: ++transactionIdRef.current,
            type: 'deposit',
            amount: amt,
            balance: newBal,
            timestamp: new Date(),
        }, ...txs].slice(0, 100))
    }, [setStoredBalance])

    // Reset balance to initial
    const resetBalance = useCallback(() => {
        updateBalance(INITIAL_BALANCE)
        setTransactions([{
            id: ++transactionIdRef.current,
            type: 'reset',
            amount: INITIAL_BALANCE,
            balance: INITIAL_BALANCE,
            timestamp: new Date(),
        }])
    }, [updateBalance])

    const value = {
        balance,
        currency,
        setCurrency,
        transactions,
        placeBet,
        addWinnings,
        deposit,
        resetBalance,
        updateBalance,
        toasts,
        showToast,
    }

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    )
}

export function useWallet() {
    const context = useContext(WalletContext)
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider')
    }
    return context
}

export default WalletContext
