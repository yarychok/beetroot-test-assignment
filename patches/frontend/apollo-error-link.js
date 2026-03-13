/**
 * Apollo Client — Error Link
 *
 * This is extracted from the Apollo Client setup in the app's entry point.
 * It intercepts GraphQL and network errors before they reach components.
 *
 * `eventBus.dispatch('globalErrorEvent', ...)` triggers the global Snackbar
 * component to display an error notification to the user.
 */

import { onError } from '@apollo/client/link/error';
import eventBus from './EventBus';

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message }) => {
      // Fix #3: the original regex /not/i.test(message) suppressed any error containing "not" - including "Not authorized", "User not found", etc.
      eventBus.dispatch('globalErrorEvent', { message });
    });
  }

  if (networkError) {
    eventBus.dispatch('globalErrorEvent', { message: networkError });
  }
});

export default errorLink; // Avoids 'errorLink' is declared but its value is never read.ts(6133)
