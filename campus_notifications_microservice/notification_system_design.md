# Campus Notifications Microservice

## Stage 1

Three types of notifications to support — Placements, Events, Results. Here's how I'd design the API so the frontend can work with it.

### Endpoints

**GET /api/notifications**

Fetch all notifications for the logged-in student.

Headers:
```json
{
  "Authorization": "Bearer <token>"
}
```

Response:
```json
{
  "notifications": [
    {
      "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "title": "Placement Drive - Google",
      "message": "Google is visiting campus on 10th May. Register before 5th May.",
      "type": "Placement",
      "isRead": false,
      "createdAt": "2024-04-28T10:30:00Z"
    }
  ],
  "unreadCount": 4
}
```

**PATCH /api/notifications/:id/read**

Mark a single notification as read.

Headers:
```json
{
  "Authorization": "Bearer <token>"
}
```

Response:
```json
{
  "success": true,
  "id": "d146095a-0d86-4a34-9e69-3900a14576bc"
}
```

**PATCH /api/notifications/read-all**

Mark all notifications as read for the student.

Headers:
```json
{
  "Authorization": "Bearer <token>"
}
```

Response:
```json
{
  "success": true,
  "updatedCount": 4
}
```

**POST /api/notifications** *(admin only)*

Send a new notification to students.

Headers:
```json
{
  "Authorization": "Bearer <admin-token>",
  "Content-Type": "application/json"
}
```

Body:
```json
{
  "title": "Result Declared - Semester 6",
  "message": "Results for Semester 6 are now available on the portal.",
  "type": "Result",
  "targetStudentIds": ["all"]
}
```

Response:
```json
{
  "success": true,
  "notificationId": "abc123",
  "dispatched": 1200
}
```

**DELETE /api/notifications/:id** *(admin only)*

Delete a notification.

Headers:
```json
{
  "Authorization": "Bearer <admin-token>"
}
```

Response:
```json
{
  "success": true
}
```

### Real-time

I'd use WebSockets (Socket.io) for real-time delivery. Each student joins a room with their student ID when they log in. When admin sends a notification, the server emits to the right rooms and the client shows a toast/badge without needing a page refresh.

If we scale to multiple Node instances, we can put Redis pub/sub in between so all instances can talk to each other.

---

## Stage 2

### DB

I'd use PostgreSQL. The data is relational — students, notification content, read status per student. SQL just makes sense here, joins are easy and we don't have to duplicate data.

```sql
CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  roll_no VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  notification_type VARCHAR(20) CHECK (notification_type IN ('Placement', 'Result', 'Event')) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE student_notifications (
  id SERIAL PRIMARY KEY,
  student_id INT REFERENCES students(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  UNIQUE(student_id, notification_id)
);
```

`student_notifications` is the join table so one notification row can be sent to many students without duplicating it.

### Problems at scale

At 50,000 students and millions of rows:
- no indexes means full table scans on every read
- marking all-as-read for a student touching thousands of rows is slow
- pagination without indexes is painful

### Queries

Get unread notifications for student 1042:
```sql
SELECT n.id, n.title, n.message, n.notification_type, n.created_at
FROM student_notifications sn
JOIN notifications n ON sn.notification_id = n.id
WHERE sn.student_id = 1042
  AND sn.is_read = false
ORDER BY n.created_at DESC
LIMIT 20 OFFSET 0;
```

Mark all as read:
```sql
UPDATE student_notifications
SET is_read = true, read_at = NOW()
WHERE student_id = 1042 AND is_read = false;
```

---

## Stage 3

The original query:
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

This works if the table is flat (one row per student-notification). In my schema from Stage 2 this wouldn't work directly since I separated it into a join table, but assuming a flat table — the logic is correct, it's just slow.

Why it's slow:
- no index on `studentID` so it scans the whole table every time
- `isRead = false` has terrible cardinality, basically useless for filtering
- `SELECT *` pulls large TEXT columns even when you don't need them
- `ORDER BY createdAt DESC` without an index means a sort on every call

Fix — add a composite index:
```sql
CREATE INDEX idx_notifications_student_unread
ON notifications (studentID, isRead, createdAt DESC);
```

Adding indexes on every column is bad advice though. Writes get slower because every INSERT/UPDATE/DELETE has to update every index. And for a boolean like `isRead` there are only 2 possible values — the query planner will often just skip the index entirely.

Only index columns you actually filter or sort on.

Query for placement notifications in the last 7 days:

```sql
SELECT *
FROM notifications
WHERE notification_type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

---

## Stage 4

Right now notifications are fetched from DB on every page load. At 50k students that's a lot of repeated queries for basically the same data.

I'd put Redis in front of it. Check cache first, if it's there return it, if not hit the DB and store the result with a TTL of maybe 30-60 seconds. Invalidate the cache key when a new notification is sent or when the student marks something as read.

| | Pros | Cons |
|---|---|---|
| No cache | Always fresh | DB gets hammered |
| Redis + TTL | Way fewer DB hits | Slightly stale for up to TTL seconds |
| Invalidate on write | Fresh when it matters | A bit more logic to manage |
| CDN cache | Very fast | Doesn't work for user-specific data |

A 30-60s TTL with invalidation on write should be fine here. Socket.io already handles the instant part for new notifications so the staleness doesn't really matter.

---

## Stage 5

Original:
```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)
        save_to_db(student_id, message)
        push_to_app(student_id, message)
```

Problems:
- processes students one by one — 50k students will take forever
- no error handling — email fails at student 200, loop crashes, students 201+ get nothing
- email, DB, and push are all coupled — if email is down, DB never gets written either
- no retries on failure

What happened with the 200 student failure: `send_email` threw an error with no try/catch around it, loop died immediately. The in-app push which had nothing to do with email also never ran.

Fix: decouple email from the rest. DB insert and in-app push should always happen. Email goes into a job queue (BullMQ) so it can retry on its own without blocking anything.

```
async function notify_all(student_ids: array, message: string):
    for batch in chunk(student_ids, 500):
        await Promise.all(batch.map(id => save_to_db(id, message)))
        await Promise.all(batch.map(id => push_to_app(id, message)))

    for student_id in student_ids:
        email_queue.add({ student_id, message }, { attempts: 3, backoff: 5000 })

email_worker.process(async (job) => {
    const { student_id, message } = job.data
    await send_email(student_id, message)
})
```

DB and push happen in parallel batches of 500. Email goes into the queue and retries up to 3 times with 5s between attempts. If the email API is down, the jobs just wait and drain when it comes back.

---

## Stage 6

See `priority_inbox.js`.

Priority scoring: `weight * 10^12 + timestamp_ms`

Weights: Placement = 3, Result = 2, Event = 1

The multiplier is large enough that type always wins over recency. Within the same type, newer notifications rank higher. Top 10 are printed.
