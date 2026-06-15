import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import Analytics from "@/components/Analytics";
import { organizationSchema, webSiteSchema } from "@/lib/schema";
import { getSiteConfig } from "@/lib/agent/siteConfig";
import { getActivePack } from "@/lib/niche/registry";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata is derived from the active niche pack (via getSiteConfig), so a new
// niche needs no edits here. Per-deployment overrides still come from env vars.
export function generateMetadata(): Metadata {
  const c = getSiteConfig();
  const base = c.baseUrl.replace(/\/$/, "");
  const title = `${c.name} — ${c.niche}`;
  const description = (c.authorBio || c.niche).slice(0, 160);

  return {
    metadataBase: new URL(base),
    title: { default: title, template: `%s | ${c.name}` },
    description,
    keywords: c.seedKeywords,
    authors: [{ name: c.name, url: base }],
    creator: c.name,
    publisher: c.name,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      url: base,
      siteName: c.name,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: { canonical: base },
    category: "technology",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  return (
    <html
      lang={getActivePack().language}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="google-site-verification" content="ff535bd7a9ec1568" />
        {/* Google AdSense library — only loads when a client id is configured */}
        {adsenseClient && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            crossOrigin="anonymous"
          />
        )}
        {process.env.BING_SITE_VERIFICATION && (
          <meta name="msvalidate.01" content={process.env.BING_SITE_VERIFICATION} />
        )}
        {process.env.YANDEX_VERIFICATION && (
          <meta name="yandex-verification" content={process.env.YANDEX_VERIFICATION} />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema()),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(webSiteSchema()),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Analytics />
        {children}
        <VercelAnalytics />
        {/* Phase 4: CTA conversion tracking — fires on [data-cta-id] clicks */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  function getSlug(){
    var m=/\\/(?:blog|services|locations)\\/([^/?#]+)/.exec(location.pathname);
    return m?m[1]:null;
  }
  function getSource(){
    try{
      var r=document.referrer;
      if(!r)return'direct';
      var h=new URL(r).hostname;
      if(h.includes('google'))return'google';
      if(h.includes('bing'))return'bing';
      if(h.includes('twitter')||h.includes('t.co'))return'twitter';
      if(h.includes('linkedin'))return'linkedin';
      if(h.includes('facebook')||h.includes('fb.com'))return'facebook';
      return h;
    }catch(e){return'direct';}
  }
  document.addEventListener('click',function(e){
    var el=e.target.closest('[data-cta-id]');
    if(!el)return;
    var ctaId=el.getAttribute('data-cta-id')||'';
    var href=(el.getAttribute('href')||'').toLowerCase();
    var type=href.includes('wa.me')||href.includes('whatsapp')?'whatsapp_click':
             href.includes('tel:')?'phone_click':
             href.includes('mailto:')?'email_click':'cta_click';
    var payload={type:type,ctaLabel:ctaId,slug:getSlug(),source:getSource()};
    if(navigator.sendBeacon){
      navigator.sendBeacon('/api/track-conversion',JSON.stringify(payload));
    }else{
      fetch('/api/track-conversion',{method:'POST',body:JSON.stringify(payload),keepalive:true}).catch(function(){});
    }
  },true);
})();`,
          }}
        />
        {/* Phase 5: Engagement tracking — scroll depth, time on page, bounce */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  var slug=(function(){
    var m=/\\/(?:blog|services|locations)\\/([^/?#]+)/.exec(location.pathname);
    return m?m[1]:null;
  })();
  if(!slug)return;

  function send(type,value){
    var src=(function(){
      try{var r=document.referrer;if(!r)return'direct';var h=new URL(r).hostname;return h;}catch(e){return'direct';}
    })();
    var payload=JSON.stringify({type:type,slug:slug,value:value,source:src});
    if(navigator.sendBeacon){navigator.sendBeacon('/api/track-engagement',payload);}
    else{fetch('/api/track-engagement',{method:'POST',body:payload,keepalive:true}).catch(function(){});}
  }

  /* Scroll depth: record max % scrolled, send on scroll stop */
  var maxScroll=0,scrollTimer=null;
  window.addEventListener('scroll',function(){
    var pct=Math.round((window.scrollY+window.innerHeight)/document.body.scrollHeight*100);
    if(pct>maxScroll)maxScroll=pct;
    clearTimeout(scrollTimer);
    scrollTimer=setTimeout(function(){send('scroll_depth',Math.min(maxScroll,100));},2000);
  },{passive:true});

  /* Time on page: send every 30s while tab is active */
  var startTime=Date.now(),totalActive=0,lastActive=Date.now(),isActive=true;
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){totalActive+=Date.now()-lastActive;isActive=false;}
    else{lastActive=Date.now();isActive=true;}
  });
  var timeTimer=setInterval(function(){
    if(!document.hidden)totalActive+=30000;
    send('time_on_page',Math.round(totalActive/1000));
  },30000);

  /* Bounce: if user leaves within 15s with <25% scroll, it's a bounce */
  window.addEventListener('beforeunload',function(){
    clearInterval(timeTimer);
    var timeSpent=(totalActive+(isActive?Date.now()-lastActive:0))/1000;
    if(timeSpent<15&&maxScroll<25){send('bounce',1);}
    else{send('exit',0);}
    send('scroll_depth',Math.min(maxScroll,100));
  });
})();`,
          }}
        />
      </body>
    </html>
  );
}

