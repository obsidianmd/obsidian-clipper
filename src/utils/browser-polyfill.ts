import * as browserPolyfill from 'webextension-polyfill';

declare global {
    const browser: typeof browserPolyfill;
}

export default browserPolyfill;