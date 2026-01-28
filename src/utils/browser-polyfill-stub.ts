/**
 * Stub for browser-polyfill when running outside of a browser extension context (e.g., Android WebView)
 * This prevents errors from the webextension-polyfill package
 */

const noop = () => {};
const noopPromise = () => Promise.resolve();

const stub = {
    runtime: {
        sendMessage: noopPromise,
        onMessage: { addListener: noop, removeListener: noop },
        getURL: (path: string) => path,
    },
    storage: {
        local: {
            get: noopPromise,
            set: noopPromise,
        },
        sync: {
            get: noopPromise,
            set: noopPromise,
        },
    },
    tabs: {
        query: noopPromise,
        sendMessage: noopPromise,
    },
};

export default stub;
