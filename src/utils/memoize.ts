interface MemoizeOptions<T extends (...args: any[]) => any> {
	resolver?: (...args: Parameters<T>) => string;
	expirationMs?: number;
	keyFn?: (...args: Parameters<T>) => string | Promise<string>;
}

export function memoize<T extends (...args: any[]) => any>(
	fn: T,
	options: MemoizeOptions<T> = {}
): T {
	const cache = new Map<string, ReturnType<T>>();
	return ((...args: Parameters<T>): ReturnType<T> => {
		const key = options.resolver ? options.resolver(...args) : JSON.stringify(args);
		if (cache.has(key)) {
			return cache.get(key)!;
		}
		const result = fn(...args);
		cache.set(key, result);
		return result;
	}) as T;
}

export function memoizeWithExpiration<T extends (...args: any[]) => any>(
	fn: T,
	options: MemoizeOptions<T>
): T {
	const cache = new Map<string, { value: ReturnType<T>; timestamp: number }>();
	return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
		const key = options.keyFn ? await options.keyFn(...args) : JSON.stringify(args);
		const now = Date.now();
		if (cache.has(key)) {
			const cached = cache.get(key)!;
			if (now - cached.timestamp < (options.expirationMs || 0)) {
				return cached.value;
			}
		}
		const result = await fn(...args);
		cache.set(key, { value: result, timestamp: now });
		return result;
	}) as unknown as T;
}