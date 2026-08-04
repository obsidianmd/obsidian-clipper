// The note location a template starts out with. Kept here, free of any browser
// imports, so the default template, the new-template form and the editor reset
// cannot drift apart.
//
// `root_domain` drops subdomains before the name is taken, so mp.weixin.qq.com
// and news.ycombinator.com file under "qq" and "ycombinator" rather than "mp"
// and "news".
export const DEFAULT_TEMPLATE_PATH = 'Clippings/{{domain|root_domain|split:"."|first}}';
