import { watch } from 'vue'
import { START_LOCATION, type Router } from 'vue-router'
import type { useAuthStore } from '@/stores/auth'

type Auth = Pick<ReturnType<typeof useAuthStore>, 'user' | 'accessToken' | 'getAuthorization'>

/** Page navigation only; backend authorization remains the server's responsibility. */
export function installMerchantAccess(router: Router, auth: Auth) {
  const isMerchant = () => Boolean(auth.getAuthorization()) && auth.user?.role === 0
  const removeGuard = router.beforeEach((to, from) => {
    const merchant = isMerchant()
    if (to.meta.merchantOnly && !merchant) return { name: 'home', replace: true }
    if (from === START_LOCATION && merchant && !to.meta.merchantOnly) {
      return { name: 'merchant-products', replace: true }
    }
  })
  // A session can change while the route's component is being downloaded.
  const removeResolveGuard = router.beforeResolve((to) => {
    if (to.meta.merchantOnly && !isMerchant()) return { name: 'home', replace: true }
  })
  const stop = watch(
    () => [auth.user?.id, auth.user?.role, auth.accessToken],
    () => {
      if (isMerchant()) {
        if (!router.currentRoute.value.meta.merchantOnly) {
          void router.replace({ name: 'merchant-products' })
        }
      } else if (router.currentRoute.value.meta.merchantOnly) {
        void router.replace({ name: 'home' })
      }
    },
    { flush: 'post' },
  )
  return () => {
    stop()
    removeGuard()
    removeResolveGuard()
  }
}
