// Browser code and presentation assets only. Full job data and server code are not public.
export const ANONYMOUS_BROWSER_ASSETS=new Set([
 '/about.html','/about.css','/about.js','/site.webmanifest','/favicon.ico','/apple-touch-icon.png',
 '/account.js','/auth-login.js','/auth.css','/auth-login-design.css','/auth-guest.js','/auth-guest.css',
 '/market-width.css','/styles.css','/next-journey-masthead.css','/styles-list.css','/styles-refinement.css','/styles-company.css','/styles-cursor.css','/layout-fixes.css','/cn-city-map.css',
 '/job-applications.js','/job-applications.css','/visitor-count.js','/company-logos.js','/list-query.js','/list-view.js','/job-store.js','/app.js','/row-fixes.js','/row-hover.js','/top30-layout.js','/market-width.js','/ui-refinement.js','/cn-city-map.js','/salary-display.js','/company-insight.js','/guestbook.js',
 '/assets/maps/cn-cities.json','/assets/maps/NOTICE.txt'
]);
export function anonymousBrowserAsset(path){return ANONYMOUS_BROWSER_ASSETS.has(path)||/^\/(?:assets|avatars)\/(?!.*(?:^|\/)\.)[^\s\\]+\.(?:webp|svg|png|jpe?g|gif|avif|ico|woff2?|ttf|otf)$/i.test(path);}

