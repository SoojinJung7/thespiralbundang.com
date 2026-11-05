// Wix served a separate mobile layout to phones; do the same here.
// Phones get /m/<path> (rewritten, URL unchanged); everyone else gets the desktop page.
import { next, rewrite } from '@vercel/functions';

export const config = {
  matcher: ['/((?!assets/|js/|css/|m/|robots\\.txt|sitemap\\.xml|favicon).*)'],
};

const PHONE = /Mobi|iPhone|iPod|Android.+Mobile|BlackBerry|IEMobile|Opera Mini|Windows Phone/i;

export default function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  const url = new URL(request.url);
  const force = url.searchParams.get('view'); // ?view=desktop | ?view=mobile for testing
  const mobile = force ? force === 'mobile' : PHONE.test(ua);
  if (!mobile) return next({ headers: { Vary: 'User-Agent' } });
  url.pathname = '/m' + url.pathname;
  return rewrite(url, { headers: { Vary: 'User-Agent' } });
}
