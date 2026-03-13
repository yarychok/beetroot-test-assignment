/**
 * Resolver: getMyCoursesV2
 *
 * Fetches all course enrollments (UserStatuses) for a student.
 * Each UserStatus links a user to a group (course instance) with a status
 * like "Studying", "Registration", "Declined", etc.
 *
 * Called by the student frontend on dashboard load.
 */

import { insertErrorLog } from './logger.js';
import getUser from './getUser.js';

async function getMyCoursesV2(parent, args, ctx, info) {
  // Fix #1: extract userId from the authenticated JWT instead of args (based on ARHITECTURE.md, getUser utility).
  // The frontend query does not send userId as an argument - the backend must identify the user from the Authorization header via getUser().
  const user = await getUser(ctx);

  if (!user) {
    throw new Error('Not authorized');
  }

  const userId = user.id;

  try {
    const userStatuses = await ctx.db.query.userStatuses(
      {
        where: {
          user: { id: userId },
          OR: [
            {
              AND: [
                {
                  status: { name: 'Declined' },
                  subStatusMany_some: { name_in: ['Autodeclined'] },
                },
              ],
            },
            {
              status: { name_not: 'Declined' },
            },
          ],
          NOT: { group: null },
        },
        orderBy: 'id_DESC',
      },
      `{
        id
        user {
          id
          email
          userName
          /* ... profile fields ... */
        }
        status {
          id
          name
        }
        paidStatus
        group {
          id
          groupStatus
          startDate
          course {
            id
            defaultLabel
          }
          teachers {
            id
            userName
          }
          groupCourse {
            id
            title
            description
            courseImage
          }
          students(where: { student: { id: "${userId}" } }) {
            groupEntryTests { /* ... */ }
            groupStudentJournals { /* ... lesson data ... */ }
          }
        }
        /* ... additional fields ... */
      }`,
    );

    return userStatuses;
  } catch (error) {
    // Fix #2 (small bug): insertErrorLog is now imported (was commented out in the original file)
    insertErrorLog({
      logAction: 'READ',
      error,
      ctx,
      title: 'getMyCoursesV2',
    });
    return [];
  }
}

export default getMyCoursesV2;
