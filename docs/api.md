# MindHarbor API 文档

> 由 `scripts/gen_api_docs.py` 从运行中的后端自动生成(共 32 个端点)。
> 接口基址:`http://172.16.2.91:8000/api/v1`

## 鉴权

除 `auth/login`、`auth/register`、`health` 外,所有请求头需携带:

```http
Authorization: Bearer <access_token>
```

## 端点总览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/api/v1/health` | Health |
| POST | `/api/v1/api/v1/auth/login` | Login |
| GET | `/api/v1/api/v1/auth/me` | Me |
| PATCH | `/api/v1/api/v1/auth/me` | Update Me |
| PUT | `/api/v1/api/v1/auth/password` | Change Password |
| POST | `/api/v1/api/v1/auth/register` | Register |
| GET | `/api/v1/api/v1/chat/sessions` | List Sessions |
| GET | `/api/v1/api/v1/chat/sessions/{session_id}` | Get Session |
| GET | `/api/v1/api/v1/chat/sessions/{session_id}/messages` | List Messages |
| POST | `/api/v1/api/v1/chat/sessions/{session_id}/end` | End Session |
| POST | `/api/v1/api/v1/chat` | Chat |
| GET | `/api/v1/api/v1/journals/mine` | My Journals |
| GET | `/api/v1/api/v1/journals/mine/{journal_id}` | My Journal Detail |
| POST | `/api/v1/api/v1/favorites/{message_id}` | Add Favorite |
| DELETE | `/api/v1/api/v1/favorites/{message_id}` | Remove Favorite |
| GET | `/api/v1/api/v1/favorites/mine` | My Favorites |
| GET | `/api/v1/api/v1/reminders/mine` | My Reminders |
| PATCH | `/api/v1/api/v1/reminders/{reminder_id}/done` | Mark Reminder Done |
| POST | `/api/v1/api/v1/counselor/chat` | Counselor Chat |
| GET | `/api/v1/api/v1/counselor/stats/emotion-distribution` | Emotion Distribution |
| GET | `/api/v1/api/v1/counselor/stats/students` | Students |
| GET | `/api/v1/api/v1/counselor/stats/students/{student_id}/detail` | Student Detail |
| GET | `/api/v1/api/v1/counselor/stats/sessions/{session_id}/messages` | Session Messages |
| GET | `/api/v1/api/v1/admin/overview` | Admin Overview |
| GET | `/api/v1/api/v1/admin/api-status` | Admin Api Status |
| GET | `/api/v1/api/v1/admin/api-configs` | List Api Configs |
| PATCH | `/api/v1/api/v1/admin/api-configs/{service_id}` | Update Api Config |
| POST | `/api/v1/api/v1/admin/api-configs/{service_id}/test` | Test Api Config |
| GET | `/api/v1/api/v1/admin/counselors` | List Counselors |
| POST | `/api/v1/api/v1/admin/counselors` | Create Counselor |
| PATCH | `/api/v1/api/v1/admin/counselors/{user_id}` | Update Counselor |
| GET | `/api/v1/api/v1/admin/students` | List Students |
| PATCH | `/api/v1/api/v1/admin/students/{user_id}` | Update Student |
| GET | `/api/v1/api/v1/admin/resources` | List Resources |
| POST | `/api/v1/api/v1/admin/resources` | Create Resource |
| DELETE | `/api/v1/api/v1/admin/resources/{resource_id}` | Delete Resource |
| PATCH | `/api/v1/api/v1/admin/resources/{resource_id}` | Update Resource |

## GET `/api/v1/api/v1/health`

**说明**:Health

**响应**:`Successful Response`


## POST `/api/v1/api/v1/auth/login`

**说明**:Login

**请求体**:

  - `username`* (string)
  - `password`* (string)

**响应**:`Successful Response`

  - `access_token`* (string)
  - `token_type` (string)
  - `user`* (object)

## GET `/api/v1/api/v1/auth/me`

**说明**:Me

**响应**:`Successful Response`

  - `id`* (integer)
  - `username`* (string)
  - `name`* (string)
  - `role`* (string)

## PATCH `/api/v1/api/v1/auth/me`

**说明**:Update Me

**请求体**:

  - `name` (object) 昵称 1-64 字符

**响应**:`Successful Response`

  - `id`* (integer)
  - `username`* (string)
  - `name`* (string)
  - `role`* (string)

## PUT `/api/v1/api/v1/auth/password`

**说明**:Change Password

**请求体**:

  - `old_password`* (string)
  - `new_password`* (string)

**响应**:`Successful Response`


## POST `/api/v1/api/v1/auth/register`

**说明**:Register

**请求体**:

  - `username`* (string) 用户名 3-32 字符
  - `password`* (string) 密码至少 6 位
  - `name` (string) 昵称

**响应**:`Successful Response`

  - `access_token`* (string)
  - `token_type` (string)
  - `user`* (object)

## GET `/api/v1/api/v1/chat/sessions`

**说明**:List Sessions

**响应**:`Successful Response`


## GET `/api/v1/api/v1/chat/sessions/{session_id}`

**说明**:Get Session

**响应**:`Successful Response`


## GET `/api/v1/api/v1/chat/sessions/{session_id}/messages`

**说明**:List Messages

**响应**:`Successful Response`


## POST `/api/v1/api/v1/chat/sessions/{session_id}/end`

**说明**:End Session

**响应**:`Successful Response`


## POST `/api/v1/api/v1/chat`

**说明**:Chat

**请求体**:

  - `session_id` (object) 已有会话 id;缺省创建新会话
  - `content`* (string) 用户消息内容(空白内容将被拒绝)
  - `end_session` (boolean) 是否结束会话并生成情绪日记

**响应**:`Successful Response`

## GET `/api/v1/api/v1/journals/mine`

**说明**:My Journals

**响应**:`Successful Response`


## GET `/api/v1/api/v1/journals/mine/{journal_id}`

**说明**:My Journal Detail

**响应**:`Successful Response`


## POST `/api/v1/api/v1/favorites/{message_id}`

**说明**:Add Favorite

**响应**:`Successful Response`


## DELETE `/api/v1/api/v1/favorites/{message_id}`

**说明**:Remove Favorite

**响应**:`Successful Response`


## GET `/api/v1/api/v1/favorites/mine`

**说明**:My Favorites

**响应**:`Successful Response`


## GET `/api/v1/api/v1/reminders/mine`

**说明**:My Reminders

**响应**:`Successful Response`


## PATCH `/api/v1/api/v1/reminders/{reminder_id}/done`

**说明**:Mark Reminder Done

**响应**:`Successful Response`


## POST `/api/v1/api/v1/counselor/chat`

**说明**:Counselor Chat

**请求体**:

  - `session_id` (object) 已有会话 id;缺省创建新会话
  - `content`* (string) 用户消息内容(空白内容将被拒绝)
  - `end_session` (boolean) 是否结束会话并生成情绪日记

**响应**:`Successful Response`

## GET `/api/v1/api/v1/counselor/stats/emotion-distribution`

**说明**:Emotion Distribution

**响应**:`Successful Response`


## GET `/api/v1/api/v1/counselor/stats/students`

**说明**:Students

**响应**:`Successful Response`


## GET `/api/v1/api/v1/counselor/stats/students/{student_id}/detail`

**说明**:Student Detail

**响应**:`Successful Response`


## GET `/api/v1/api/v1/counselor/stats/sessions/{session_id}/messages`

**说明**:Session Messages

**响应**:`Successful Response`


## GET `/api/v1/api/v1/admin/overview`

**说明**:Admin Overview

**响应**:`Successful Response`


## GET `/api/v1/api/v1/admin/api-status`

**说明**:Admin Api Status

**响应**:`Successful Response`


## GET `/api/v1/api/v1/admin/api-configs`

**说明**:List Api Configs

**响应**:`Successful Response`


## PATCH `/api/v1/api/v1/admin/api-configs/{service_id}`

**说明**:Update Api Config

**请求体**:

  - `enabled` (object)
  - `base_url` (object)
  - `model` (object)
  - `api_key` (object)
  - `context_window` (object)
  - `max_tokens` (object)
  - `timeout_seconds` (object)
  - `token_budget` (object)
  - `fallback` (object)

**响应**:`Successful Response`


## POST `/api/v1/api/v1/admin/api-configs/{service_id}/test`

**说明**:Test Api Config

**响应**:`Successful Response`


## GET `/api/v1/api/v1/admin/counselors`

**说明**:List Counselors

**响应**:`Successful Response`


## POST `/api/v1/api/v1/admin/counselors`

**说明**:Create Counselor

**请求体**:

  - `username`* (string)
  - `password`* (string)
  - `name`* (string)
  - `title` (string)
  - `specialty` (string)
  - `bio` (string)
  - `availability` (string)

**响应**:`200`

## PATCH `/api/v1/api/v1/admin/counselors/{user_id}`

**说明**:Update Counselor

**请求体**:

  - `name` (object)
  - `password` (object)
  - `title` (object)
  - `specialty` (object)
  - `bio` (object)
  - `availability` (object)
  - `is_enabled` (object)

**响应**:`Successful Response`


## GET `/api/v1/api/v1/admin/students`

**说明**:List Students

**响应**:`Successful Response`


## PATCH `/api/v1/api/v1/admin/students/{user_id}`

**说明**:Update Student

**请求体**:

  - `name` (object)
  - `risk_tags` (object)
  - `is_enabled` (object)

**响应**:`Successful Response`


## GET `/api/v1/api/v1/admin/resources`

**说明**:List Resources

**响应**:`Successful Response`


## POST `/api/v1/api/v1/admin/resources`

**说明**:Create Resource

**请求体**:

  - `title`* (string)
  - `type` (string)
  - `content` (string)
  - `url` (object)
  - `is_active` (boolean)

**响应**:`200`

## DELETE `/api/v1/api/v1/admin/resources/{resource_id}`

**说明**:Delete Resource

**响应**:`200`

## PATCH `/api/v1/api/v1/admin/resources/{resource_id}`

**说明**:Update Resource

**请求体**:

  - `title` (object)
  - `type` (object)
  - `content` (object)
  - `url` (object)
  - `is_active` (object)

**响应**:`Successful Response`

