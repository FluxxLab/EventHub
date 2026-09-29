/**
 * Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`): the console runs on sample data with no API, so the
 * design can be reviewed before the backend is up. Sign-in accepts any email and password. Never
 * set it on a deployed console.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
