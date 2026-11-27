self.addEventListener('push', event => {
  const payload = event.data?.json?.() || {};
  event.waitUntil(self.registration.showNotification(payload.title || 'Rollapp', {
    body: payload.body || '',
    tag: payload.tag || 'rollapp-notification',
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: { url: payload.url || '/' },
    actions: Array.isArray(payload.actions) ? payload.actions : [],
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requested = new URL(event.notification.data?.url || '/', self.location.origin);
  const target = requested.origin === self.location.origin ? requested.toString() : self.location.origin;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const current = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (current) {
      await current.navigate(target);
      return current.focus();
    }
    return self.clients.openWindow(target);
  })());
});
