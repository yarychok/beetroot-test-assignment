# Solution

## 1. What is broken
Found 5 issues total - 1 root cause and 4 others that together create a silent failure where the bug doesn't produce any error messages.

1. `getMyCoursesV2.js`: `userId` from `args` instead of JWT (root cause)
2. `getMyCoursesV2.js`: `insertErrorLog` import commented out
3. `apollo-error-link.js`: `/not/i` regex suppresses critical errors
4. `logger.js`:`insertLog` returns early - all logging disabled
5. `apolloClient.js`: `errorPolicy: 'all'` commented out

## 2. Debugging process

Logged in with the test credentials at `https://betastudent.beetroot.academy`. The test student's personal info load correctly, the contribution page shows 1 course, but the "My Courses" page just says "You don't have any courses yet," and the header dropdown for courses renders an empty `<ul>` with only the "See all courses" link (we are not able to navigate to the "My courses" page).

No error messages, nothing in the browser console either, which tells about a data failure with no error feedback to the user.

On the Network tab, there are two POST requests to `betastudent.beetroot.academy:4000/`, both returning 200 OK. The first is `getStudentNotifications` (with `variables: {}`), the second is the `getMyCourses` query - also with `variables: {}`, meaning no `userId` is sent:

```json
{
  "operationName": "getMyCourses",
  "query": "query getMyCourses { getMyCoursesV2 { ... } }",
  "variables": {}
}
```

Decoding the JWT (using `https://www.jwt.io/`) from the Authorization header shows the user info is present:

```json
{
  "user": {
    "id": "cmm8v76n96hpp0834hnz92nsd",
    "userName": "TEST CANDIDATE",
    "email": "testcandidate@test.com",
    "roles": [{"name": "ROLE_STUDENT"}]
  }
}
```

The `userrole: ROLE_STUDENT` custom header is also being sent (matching what `/apolloClient.js` does in `authLink`). So the auth is fully working and the user ID is in the token, the backend just never reads it.

(Btw: the "Select course" link says it goes to `https://betastudent.beetroot.academy` on hover but actually redirects to `https://beetrootua.webflow.io` instead of the real Beetroot site at `https://beetroot.academy`.)

## 3. Fixes

### Bug 1

**File:** `/getMyCoursesV2.js`, line 14

```js
const userId = args.userId || '';
```

The resolver reads `userId` from query arguments. But the frontend query in `/studentPartQuery.js` doesn't send any variables - it's just `query getMyCourses { getMyCoursesV2 { ... } }` with no args. So `args.userId` is always `undefined`, the fallback gives us `''`, and the Prisma query `where: { user: { id: '' } }` matches zero records.

Based on `/getUser.js` and the auth flow described in `ARCHITECTURE.md`, the resolver should be using `getUser(ctx)` to extract the user from the JWT.

**Fix:** `patches/backend/getMyCoursesV2.js`

Looking into why there's no error messages anywhere, I found 4 more issues that together make this bug undetectable:

### Bug 2

**The error logging import is commented out** - `/getMyCoursesV2.js`, line 11:

```js
// import { insertErrorLog } from '<error-logging-utility>';
```

The catch block calls `insertErrorLog()`, but the import is commented out. That will throw a `ReferenceError`, which is caught by the same catch block.

### Bug 3

**The error link swallows errors containing "not"** - `/apollo-error-link.js`, line 19:

```js
if (/not/i.test(message)) {
  return;
}
```

This regex suppresses any GraphQL error with "not" in the message, which covers "Not authorized", "User not found", "Token has not been provided". Even if the backend threw an error instead of returning `[]`, the student would never see it. 

**Fix:** `patches/frontend/apollo-error-link.js`

### Bug 4

**Backend logger does nothing** - `/logger.js`, line 22:

```js
export async function insertLog(data, ctx) {
  console.log('LOGGGER ===> ');
  return;  // <- Everything after this is unreachable code
```

There's an early `return` at the top of `insertLog`, so nothing gets written to the database. Since `insertErrorLog` calls `insertLog` internally, the logging flow is dead.

**Fix:** `patches/backend/logger.js`

### Bug 5

**`errorPolicy: 'all'` is commented out** - `/apolloClient.js`, line 109:

```js
defaultOptions: {
  query: {
    fetchPolicy: 'no-cache',
    // errorPolicy: 'all',
  },
},
```

`errorPolicy: 'all'` should catch all unhandled errors.

**Fix:** Uncomment `errorPolicy: 'all'` at `patches/frontend/apolloClient.js`


## 4. Why hard to detect

- Resolver queries with `userId = ''` -> gets back `[]` -> looks like success
- Logging import is commented out + `insertLog` bails early -> nothing recorded, no alerts
- Error link regex eats anything with "not" -> no UI error feedback
- Error policy is off -> partial errors get swallowed too

The student sees their name, sees "no courses", and there's nothing indicates about anything is wrong. It looks like a data issue, not a code bug, but without looking at the resolver code it's not detectable.


## 5. Additional improvements for production system

- Add separate `loading`, `error`, and `data` states from the Apollo hook so it can show "Something went wrong" vs "No courses yet"
- An integration test that logs in as a test student and checks for a non-empty course list would've caught this instantly.
- Add backend logging for `userId`, so an empty-string lookup is visible.
- The `args.userId` is vulnerable, because any authenticated student could query another student's courses by guessing it's ID. The JWT approach is correct and secure.
- Small improvement - naming consistency for files (`apollo-error-link.js` -> `apolloErrorLink.js` to keep everything in camel case). `getMyCoursesV2.js` looks weird as well (why not `getMyCourses.js`?). 