import Script from "next/script";

/**
 * Google Analytics 4 + optional Google Tag Manager.
 *
 * Set in env (Vercel):
 *   NEXT_PUBLIC_GA_ID  = G-XXXXXXXXXX  (GA4 measurement ID, optional)
 *   NEXT_PUBLIC_GTM_ID = GTM-XXXXXXX   (GTM container, optional)
 *
 * If NEXT_PUBLIC_GA_ID is set, GA4 loads with conversion-event tracking.
 * If NEXT_PUBLIC_GTM_ID is set, GTM loads (recommended for advanced
 * tracking — you manage tags in GTM UI without code changes).
 */

const GA_ID  = process.env.NEXT_PUBLIC_GA_ID  || "G-HH2FE5P4KF";
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "";

export default function Analytics() {
  return (
    <>
      {GA_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', {
                page_path: window.location.pathname,
                send_page_view: true,
              });
              // Forward CTA clicks as GA4 conversion events
              document.addEventListener('click', function(e){
                var el = e.target.closest('[data-cta-id]');
                if (!el) return;
                var label = el.getAttribute('data-cta-id') || '';
                var href  = (el.getAttribute('href') || '').toLowerCase();
                var event = href.includes('wa.me') || href.includes('whatsapp') ? 'whatsapp_click'
                          : href.includes('tel:')     ? 'phone_click'
                          : href.includes('mailto:')  ? 'email_click'
                          : 'cta_click';
                gtag('event', event, {
                  event_category: 'engagement',
                  event_label:    label,
                  value:          1,
                });
              }, true);
            `}
          </Script>
        </>
      )}

      {GTM_ID && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
      )}
    </>
  );
}
