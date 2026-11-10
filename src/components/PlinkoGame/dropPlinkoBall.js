import { MAX_ACTIVE_BALLS } from './constants';

export async function dropPlinkoBall({
    engine,
    pendingDrops,
    provablyFair,
    rowCount,
    betAmount,
    currentBall,
    selectedBallType,
    placeBet,
    isCancelled = () => false,
}) {
    if (!engine || engine.getActiveBallCount() + pendingDrops.current >= MAX_ACTIVE_BALLS) return 'busy';

    pendingDrops.current++;
    try {
        const fairnessResult = await provablyFair.generatePlinkoPath(rowCount);
        if (isCancelled()) return 'cancelled';
        if (engine.getActiveBallCount() >= MAX_ACTIVE_BALLS) return 'busy';
        if (!placeBet(betAmount * (currentBall.cost ?? 1))) return 'insufficient-funds';

        engine.updateBallStyle(currentBall.color, currentBall.image);
        const binIndex = fairnessResult.path.reduce((sum, direction) => sum + direction, 0);
        return engine.dropBall(binIndex, selectedBallType) ? 'dropped' : 'busy';
    } finally {
        pendingDrops.current--;
    }
}
