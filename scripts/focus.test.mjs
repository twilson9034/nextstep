import assert from 'node:assert/strict';
import {startClock,pauseClock,resumeClock,remainingSeconds,eligibleNow,focusTarget} from '../src/focus.ts';
const c=startClock(5,1000);assert.equal(remainingSeconds(c,11000),290);const p=pauseClock(c,11000);assert.equal(remainingSeconds(p,999999),290);assert.equal(remainingSeconds(resumeClock(p,20000),30000),280);assert.equal(remainingSeconds(c,999999),0);
assert.equal(eligibleNow({repeat_rule:'weekly',due_date:'2026-12-01'},'2026-11-27'),false);assert.equal(eligibleNow({repeat_rule:'weekly',due_date:'2026-11-27'},'2026-11-27'),true);assert.equal(eligibleNow({repeat_rule:'none',due_date:'2026-12-01'},'2026-11-27'),true);
const tasks=[{id:'a',done:false},{id:'b',done:true}];assert.equal(focusTarget(tasks,'a'),tasks[0]);assert.equal(focusTarget(tasks,'b'),null);assert.equal(focusTarget(tasks,'missing'),null);
console.log('PASS: elapsed-clock pause/resume, expired clock, recurring eligibility and focus continuity');
