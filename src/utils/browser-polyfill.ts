declare const chrome: any;

const browserPolyfill = typeof browser !== 'undefined' ? browser : chrome;

export default browserPolyfill;