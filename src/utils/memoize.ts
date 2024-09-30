export function memoize<T extends (...args: any[]) => any>(fn: T): T {
	const cache = new Map<string, ReturnType<T>>();
	return ((...args: Parameters<T>): ReturnType<T> => {
		const key = JSON.stringify(args);
		if (cache.has(key)) {
			return cache.get(key)!;
		}
		const result = fn(...args);
		cache.set(key, result);
		return result;
	}) as T;
}

interface MemoizeOptions {
	expirationMs: number;
	keyFn?: (...args: any[]) => string | Promise<string>;
}

export function memoizeWithExpiration<T extends (...args: any[]) => any>(
	fn: T,
	options: MemoizeOptions
): T {
	const cache = new Map<string, { value: ReturnType<T>; timestamp: number }>();
	return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
		const key = options.keyFn ? await options.keyFn(...args) : JSON.stringify(args);
		const now = Date.now();
		if (cache.has(key)) {
			const cached = cache.get(key)!;
			if (now - cached.timestamp < options.expirationMs) {
				return cached.value;
			}
		}
		const result = await fn(...args);
		cache.set(key, { value: result, timestamp: now });
		return result;
	}) as unknown as T;
}