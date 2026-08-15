# MindHarbor API 文档

> 由后端 OpenAPI(swagger)自动生成 · MindHarbor v0.1.0 · 基址 `http://172.16.2.91:8000/api/v1`(本地 `http://localhost:8000/api/v1`)

## 鉴权

除 `auth/login`、`auth/register` 外,所有接口需在请求头携带:

```
Authorization: Bearer <access_token>
```

## 端点总览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/login` | Login |
| GET | `/api/v1/auth/me` | Me |
| POST | `/api/v1/auth/register` | Register |
| POST | `/api/v1/chat` | Chat |
| GET | `/api/v1/chat/sessions` | List Sessions |
| GET | `/api/v1/chat/sessions/{session_id}/messages` | List Messages |
| GET | `/api/v1/favorites/mine` | My Favorites |
| POST | `/api/v1/favorites/{message_id}` | Add Favorite |
| DELETE | `/api/v1/favorites/{message_id}` | Remove Favorite |
| GET | `/api/v1/health` | Health |
| GET | `/api/v1/journals/mine` | My Journals |
| GET | `/api/v1/journals/mine/{journal_id}` | My Journal Detail |

## 详细定义

### POST `/api/v1/auth/login`

**Login**

- tags:`auth`
- **请求体**(`application/json`): `LoginRequest`{username*:string, password*:string}
- **响应**:
  - `200` Successful Response → `TokenResponse`{access_token*:string, token_type:string, user*:UserOut}
  - `422` Validation Error → `HTTPValidationError`{detail:array}

### GET `/api/v1/auth/me`

**Me**

- tags:`auth`
- **响应**:
  - `200` Successful Response → `UserOut`{id*:integer, username*:string, name*:string, role*:string}

### POST `/api/v1/auth/register`

**Register**

学生注册(注册即登录);用户名重复返回 409。

- tags:`auth`
- **请求体**(`application/json`): `RegisterRequest`{username*:string, password*:string, name:string}
- **响应**:
  - `200` Successful Response → `TokenResponse`{access_token*:string, token_type:string, user*:UserOut}
  - `422` Validation Error → `HTTPValidationError`{detail:array}

### POST `/api/v1/chat`

**Chat**

发起一次对话;返回 text / tool_card / journal / error 事件流。

先 strip 校验内容:空白直接产出 error 事件,不创建/触碰会话(避免孤儿会话行)。

- tags:`chat`
- **请求体**(`application/json`): `ChatRequest`{session_id:integer / null, content*:string, end_session:boolean}
- **响应**:
  - `200` Successful Response → ?
  - `422` Validation Error → `HTTPValidationError`{detail:array}

### GET `/api/v1/chat/sessions`

**List Sessions**

我的会话列表(倒序,最多 50 条)。

- tags:`chat`
- **响应**:
  - `200` Successful Response → array

### GET `/api/v1/chat/sessions/{session_id}/messages`

**List Messages**

会话历史消息(仅本人);非本人 403、不存在 404。

- tags:`chat`
- **路径/查询参数**:
  - `session_id`(integer,required): 
- **响应**:
  - `200` Successful Response → array
  - `422` Validation Error → `HTTPValidationError`{detail:array}

### GET `/api/v1/favorites/mine`

**My Favorites**

- tags:`favorites`
- **响应**:
  - `200` Successful Response → array

### POST `/api/v1/favorites/{message_id}`

**Add Favorite**

- tags:`favorites`
- **路径/查询参数**:
  - `message_id`(integer,required): 
- **响应**:
  - `200` Successful Response → object
  - `422` Validation Error → `HTTPValidationError`{detail:array}

### DELETE `/api/v1/favorites/{message_id}`

**Remove Favorite**

- tags:`favorites`
- **路径/查询参数**:
  - `message_id`(integer,required): 
- **响应**:
  - `200` Successful Response → object
  - `422` Validation Error → `HTTPValidationError`{detail:array}

### GET `/api/v1/health`

**Health**

- tags:`health`
- **响应**:
  - `200` Successful Response → object

### GET `/api/v1/journals/mine`

**My Journals**

- tags:`journals`
- **响应**:
  - `200` Successful Response → array

### GET `/api/v1/journals/mine/{journal_id}`

**My Journal Detail**

- tags:`journals`
- **路径/查询参数**:
  - `journal_id`(integer,required): 
- **响应**:
  - `200` Successful Response → object
  - `422` Validation Error → `HTTPValidationError`{detail:array}
