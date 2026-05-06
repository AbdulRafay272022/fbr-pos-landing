import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import Analytics from "@/components/Analytics";
import { organizationSchema, webSiteSchema } from "@/lib/schema";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://phelixerp.vercel.app"),
  title: {
    default: "Phelix ERP — FBR POS System Pakistan | FBR e-Invoicing Software",
    template: "%s | Phelix ERP Pakistan",
  },
  description:
    "Pakistan's leading FBR-compliant POS system. Real-time QR invoice submission to FBR IRIS, inventory management, and sales reports. Setup in 24 hours. Trusted by 20+ businesses.",
  keywords: [
    "FBR POS system Pakistan",
    "FBR e-invoicing software Pakistan",
    "POS software Pakistan FBR compliant",
    "QR invoice system Pakistan",
    "retail POS Pakistan",
    "FBR POS Karachi",
    "FBR POS Lahore",
    "pharmacy POS Pakistan",
    "FBR invoice QR generator",
    "FBR compliance Pakistan",
    "how to register POS with FBR",
    "Phelix ERP",
    "FBR POS software",
    "Pakistan billing software",
    "FBR integrated POS",
    "ERP Pakistan small business",
  ],
  authors: [{ name: "Phelix ERP", url: "https://phelixerp.vercel.app" }],
  creator: "Phelix ERP",
  publisher: "Phelix ERP",
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
    locale: "en_PK",
    url: "https://phelixerp.vercel.app",
    siteName: "Phelix ERP",
    title: "Phelix ERP — FBR POS System Pakistan | FBR e-Invoicing Software",
    description:
      "Pakistan's leading FBR-compliant POS system. QR invoices, FBR IRIS integration, inventory management. Setup in 24 hours.",
    images: [
      {
        url: "/dashboard-screenshot.png",
        width: 1200,
        height: 630,
        alt: "Phelix ERP — FBR POS System Pakistan dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Phelix ERP — FBR POS System Pakistan",
    description:
      "FBR-compliant POS with QR invoicing, inventory management & sales reports. Trusted by 20+ Pakistan businesses.",
    images: ["/dashboard-screenshot.png"],
  },
  alternates: {
    canonical: "https://phelixerp.vercel.app",
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-PK"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="google-site-verification" content="ff535bd7a9ec1568" />
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

