import ApplicationInstance from '@ember/application/instance';
import environmentConfig from 'ember-get-config';
import Sentry from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  const config = environmentConfig['@sentry/ember'];
  if (config['disablePerformance']) {
    return;
  }
  instrumentForPerformance(appInstance);
}

function getTransitionInformation(transition: any, router: any) {
  const fromRoute = transition?.from?.name;
  const toRoute = transition ? transition.to.name : router.currentRouteName;
  return {
    fromRoute,
    toRoute,
  };
}

export async function instrumentForPerformance(appInstance: ApplicationInstance) {
  const config = environmentConfig['@sentry/ember'];
  const sentryConfig = config.sentry;
  const tracing = await import('@sentry/tracing');

  const idleTimeout = config.transitionTimeout || 15000;

  sentryConfig['integrations'] = [
    ...(sentryConfig['integrations'] || []),
    new tracing.Integrations.BrowserTracing({
      routingInstrumentation: (startTransaction, startTransactionOnPageLoad) => {
        const location = appInstance.lookup('router:main').location;
        const router = appInstance.lookup('service:router');
        let activeTransaction: any;
        const url = location && location.getURL && location.getURL();
        if (startTransactionOnPageLoad && url) {
          const routeInfo = router.recognize(url);
          activeTransaction = startTransaction({
            name: `route:${routeInfo.name}`,
            op: 'pageload',
            tags: {
              url,
              toRoute: routeInfo.name,
              'routing.instrumentation': '@sentry/ember',
            },
          });
        }

        router.on('routeWillChange', (transition: any) => {
          const { fromRoute, toRoute } = getTransitionInformation(transition, router);
          activeTransaction = startTransaction({
            name: `route:${toRoute}`,
            op: 'navigation',
            tags: {
              fromRoute,
              toRoute,
              'routing.instrumentation': '@sentry/ember',
            },
          });
        });
        router.on('routeDidChange', () => {
          if (activeTransaction) {
            activeTransaction.finish();
          }
        });
      },
      idleTimeout,
    }),
  ];

  const browserClient = new Sentry.BrowserClient(sentryConfig);
  Sentry.getCurrentHub().bindClient(browserClient);
}

export default {
  initialize,
};
