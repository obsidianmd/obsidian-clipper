// Runs func once (deduplicated) per frame until duration is over
// Returned function resets timer
export function toRunEachFrame<T extends (...args: any[]) => any>(func: T, duration: number): (...args: Parameters<T>) => void {
    let endTime: number | null = null;
    let callbackId: number | null = null;

    function applyIfNotEnded(timestamp: number) {
        if (!endTime) {
            endTime = timestamp + duration;
        }
        if (timestamp < endTime) {
            func();
            callbackId = requestAnimationFrame(applyIfNotEnded);
        }
    }

    function resetEndTime() {
        if (callbackId != null) {
            cancelAnimationFrame(callbackId);
        }
        if (endTime != null) {
            endTime = null;
        }
        callbackId = requestAnimationFrame(applyIfNotEnded);
    }

    return resetEndTime;
}