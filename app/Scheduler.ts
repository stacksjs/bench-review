import process from 'node:process'
import { schedule } from '@stacksjs/scheduler'

/**
 * **Scheduler**
 *
 * Define your scheduled tasks here. Jobs, actions, and shell commands
 * can all be scheduled with a fluent, expressive API.
 *
 * @see https://docs.stacksjs.com/scheduling
 */
export default function () {
  // Run the Inspire job every hour
  schedule
    .job('Inspire')
    .hourly()
    .setTimeZone('America/Los_Angeles')

  // Weekly digest to the newsletter list (bench-review#57). Tuesday rather
  // than Monday: Monday inboxes are the weekend's backlog, and reviews
  // published over a weekend have landed by then.
  //
  // `onDays([2])` ALONE, deliberately. The fluent cadence methods each
  // overwrite the whole cron pattern rather than refining it: `onDays` sets
  // `0 0 * * 2`, and `at('09:00')` sets `0 9 * * *`. Chained as
  // `.onDays([2]).at('09:00')` the result is `0 9 * * *` — every day — so
  // that spelling would mail the entire list daily. Reversed, the time is
  // lost instead. There is no raw-cron escape hatch, so the choice is the
  // day or the hour, and the day matters more. Midnight Pacific lands in
  // front of most of the list on Tuesday morning anyway.
  //
  // The job also carries its own re-run guard — it checks for a digest
  // already sent inside the window before doing anything — because a
  // scheduler restart can re-fire a task, and the cost of being wrong here
  // is the whole list getting the same mail twice.
  schedule
    .job('SendWeeklyDigest')
    .onDays([2])
    .setTimeZone('America/Los_Angeles')

  // Run a custom action every five minutes
  // schedule.action('CleanupTempFiles').everyFiveMinutes()

  // Run a shell command daily at midnight
  // schedule.command('echo "Daily maintenance complete"').daily()
}

process.on('SIGINT', () => {
  schedule.gracefulShutdown().then(() => process.exit(0))
})
