# MindHarbor API 文档

> 由 `scripts/gen_api_docs.py` / openapi.json 自动生成(共 18 个端点)。
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
| POST | `/api/v1/api/v1/counselor/chat` | Counselor Chat |
| GET | `/api/v1/api/v1/counselor/stats/emotion-distribution` | Emotion Distribution |
| GET | `/api/v1/api/v1/counselor/stats/students` | Students |
| GET | `/api/v1/api/v1/counselor/stats/students/{student_id}/detail` | Student Detail |
| GET | `/api/v1/api/v1/counselor/stats/sessions/{session_id}/messages` | Session Messages |

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

