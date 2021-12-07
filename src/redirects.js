import { getConfig } from 'src/config'
import AuthAction from 'src/AuthAction'

/**
 * redirectUnauthenticatedUser redirects unauthenticated user to the auth page specified
 * in the config or in the configuration of `withAuthUserTokenSSR`
 *
 * @param {Object} redirectSettings
 */
export const redirectUnauthenticatedUser = (
  unauthenticatedRedirectURL,
  ctx,
  AuthUser
) => {
  if (!unauthenticatedRedirectURL) {
    throw new Error(
      `When "whenUnauthed" is set to AuthAction.REDIRECT_TO_LOGIN, "authPageURL" must be set.`
    )
  }
  const destination =
    typeof unauthenticatedRedirectURL === 'string'
      ? unauthenticatedRedirectURL
      : unauthenticatedRedirectURL({ ctx, AuthUser })

  if (!destination) {
    throw new Error(
      'The "authPageURL" must be set to a non-empty string or resolve to a non-empty string'
    )
  }

  return {
    redirect: {
      destination,
      permanent: false,
    },
  }
}

/**
 * redirectAuthenticatedUser.
 *
 * @param {} redirectSettings
 */
export const redirectAuthenticatedUser = (
  authenticatedRedirectURL,
  ctx,
  AuthUser
) => {
  if (!authenticatedRedirectURL) {
    throw new Error(
      `When "whenAuthed" is set to AuthAction.REDIRECT_TO_APP, "appPageURL" must be set.`
    )
  }
  const destination =
    typeof authenticatedRedirectURL === 'string'
      ? authenticatedRedirectURL
      : authenticatedRedirectURL({ ctx, AuthUser })

  if (!destination) {
    throw new Error(
      'The "appPageURL" must be set to a non-empty string or resolve to a non-empty string'
    )
  }
  return {
    redirect: {
      destination,
      permanent: false,
    },
  }
}

/**
 * findLegacyRedirect.
 *
 * @param {} redirectSettings
 */
function* findLegacyRedirect({
  authPageURL,
  whenUnauthed,
  whenAuthed,
  appPageURL,
  AuthUser,
  ctx,
}) {
  const unauthenticatedRedirectURL = authPageURL || getConfig().authPageURL // by default, unauthed go to authPageURL
  const shouldRedirectUnauthedUser =
    !AuthUser.id && whenUnauthed === AuthAction.REDIRECT_TO_LOGIN
  const authenticatedRedirectURL = appPageURL || getConfig().appPageURL // by default, authed go to appPageURL
  const shouldRedirectAuthedUser =
    AuthUser.id && whenAuthed === AuthAction.REDIRECT_TO_APP

  yield unauthenticatedRedirectURL || authenticatedRedirectURL

  // If specified, redirect to the login page if the user is unauthed.
  if (shouldRedirectUnauthedUser)
    return redirectUnauthenticatedUser(
      unauthenticatedRedirectURL,
      ctx,
      AuthUser
    )

  // If specified, redirect to the app page if the user is authed.
  if (shouldRedirectAuthedUser)
    return redirectAuthenticatedUser(authenticatedRedirectURL, ctx, AuthUser)

  return null
}

/**
 * findRedirectRule.
 *
 * @param {}
 */
const findRedirectRule = ({ AuthUser, redirectConfig }) => {
  const config = redirectConfig || getConfig().redirectConfig
  if (!config) return null

  const redirect = AuthUser.id
    ? config.authenticatedUser
    : config.unauthenticatedUser

  return { redirect }
}

/**
 * processRedirect.
 *
 * @param {} redirectSettings
 */
export const processRedirect = (redirectSettings) => {
  const legacyRedirect = findLegacyRedirect(redirectSettings)
  const { value: useLegacyRedirect } = legacyRedirect.next()

  if (!useLegacyRedirect) {
    return findRedirectRule(redirectSettings)
  }

  const { value: redirect } = legacyRedirect.next()
  return redirect
}
