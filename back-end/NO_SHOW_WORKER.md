Run the no-show worker alongside the Django server:

```powershell
cd back-end/cms_proj
..\myvirtualenv\Scripts\python.exe manage.py process_no_shows --watch --interval 5
```

In production, run this command under the deployment's process supervisor with automatic restart enabled. It must run independently of browser sessions and the web server. Alternatively invoke `process_no_shows` without `--watch` from an existing scheduler.

The worker checks every five seconds; appointments become eligible after their scheduled start plus the arrival grace period and are processed on the next check. Open reception pages poll the database every 30 seconds. Manual actions invalidate both dashboard and appointment queries immediately.

Only SCHEDULED prior bookings are processed. The grace period comes from `appointment.noShowGraceMinutes` (default 15 minutes). Cancelled and No-show reservations and tokens remain blocked. The current Doctor model has no per-doctor slot-duration setting. Comparisons use Django's configured clinic timezone. Row locks and conditional updates prevent expired scheduled appointments from overwriting check-ins.
