# Database Design — AutoQA Gen

## Tổng quan

| Mục | Giá trị |
|-----|---------|
| DBMS | MongoDB |
| Driver | Motor (async) |
| Database name | `autoqa_gen` |
| Collections | `users`, `history` |

Không dùng quan hệ (foreign key) — liên kết giữa hai collection thông qua trường `user_id` (string UUID).

---

## Collection: `users`

Lưu thông tin tài khoản người dùng.

### Document schema

```json
{
  "_id":             "uuid-v4 string",
  "email":           "string (unique, indexed)",
  "full_name":       "string",
  "hashed_password": "string (bcrypt hash)",
  "img_url":         "string | null",
  "is_active":       "boolean",
  "created_at":      "datetime (UTC)"
}
```

### Mô tả các trường

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `_id` | string | ✓ | UUID v4, do ứng dụng sinh (không dùng ObjectId) |
| `email` | string | ✓ | Email đăng nhập, unique trong toàn collection |
| `full_name` | string | ✓ | Tên hiển thị, tối thiểu 2 ký tự |
| `hashed_password` | string | ✓ | Bcrypt hash, không bao giờ trả về client |
| `img_url` | string | ✗ | URL ảnh đại diện, nullable |
| `is_active` | boolean | ✓ | Mặc định `true`; dùng để vô hiệu hóa tài khoản |
| `created_at` | datetime | ✓ | Thời điểm đăng ký (UTC) |

### Indexes

| Tên index | Trường | Thuộc tính | Mục đích |
|-----------|--------|-----------|---------|
| `users_email_unique` | `email` ASC | unique | Tra cứu nhanh khi login; ngăn trùng email |

---

## Collection: `history`

Lưu kết quả mỗi lần sinh test case. Một lần chạy Research tạo ra nhiều document (mỗi provider một document), liên kết với nhau bằng `session_id`.

### Document schema

```json
{
  "_id":        "uuid-v4 string",
  "user_id":    "string (ref → users._id)",
  "requirement":"string",
  "provider":   "pipeline | openai | gemini | claude",
  "mode":       "pipeline | research",
  "language":   "string (e.g. Vietnamese, English)",
  "is_favorite":"boolean",
  "session_id": "uuid-v4 string | null",
  "result": {
    "test_suite_name": "string",
    "description":     "string",
    "test_cases": [
      {
        "test_case_id":   "string (TC_001, TC_002, ...)",
        "title":          "string",
        "priority":       "High | Medium | Low",
        "category":       "Functional | UI/UX | Negative | Security",
        "preconditions":  ["string"],
        "steps":          ["string"],
        "expected_result":"string",
        "test_data":      {}
      }
    ],
    "total_count": "number",
    "provider":    "string",
    "mode":        "string"
  },
  "created_at": "datetime (UTC)"
}
```

### Mô tả các trường gốc (root level)

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `_id` | string | ✓ | UUID v4 |
| `user_id` | string | ✓ | Tham chiếu đến `users._id` |
| `requirement` | string | ✓ | Nội dung yêu cầu người dùng nhập |
| `provider` | string | ✓ | Model đã sinh kết quả: `pipeline`, `openai`, `gemini`, `claude` |
| `mode` | string | ✓ | Chế độ sinh: `pipeline` hoặc `research` |
| `language` | string | ✓ | Ngôn ngữ output (ví dụ: `Vietnamese`) |
| `is_favorite` | boolean | ✓ | Người dùng đã đánh dấu yêu thích chưa |
| `session_id` | string | ✗ | Chỉ có trong mode `research` — nhóm các document cùng phiên so sánh |
| `result` | object | ✓ | Kết quả sinh test case (xem bên dưới) |
| `created_at` | datetime | ✓ | Thời điểm sinh (UTC) |

### Mô tả subdocument `result`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `test_suite_name` | string | Tên bộ test case do AI đặt |
| `description` | string | Mô tả ngắn bộ test (1 câu) |
| `test_cases` | array | Danh sách test case (xem bên dưới) |
| `total_count` | number | Tổng số test case trong mảng |
| `provider` | string | Provider sinh ra result này |
| `mode` | string | Mode (`pipeline` / `research`) |

### Mô tả từng phần tử trong `test_cases[]`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `test_case_id` | string | Định danh: `TC_001`, `TC_002`, … |
| `title` | string | Tiêu đề mô tả kịch bản |
| `priority` | string | `High` / `Medium` / `Low` |
| `category` | string | `Functional` / `UI/UX` / `Negative` / `Security` |
| `preconditions` | string[] | Điều kiện tiên quyết trước khi thực hiện |
| `steps` | string[] | Các bước thực hiện (có thứ tự) |
| `expected_result` | string | Kết quả mong đợi |
| `test_data` | object | Dữ liệu test cụ thể (nullable / empty object nếu không có) |

### Indexes

| Tên index | Trường | Mục đích |
|-----------|--------|---------|
| `history_user_date` | `user_id` ASC, `created_at` DESC | Query danh sách lịch sử theo user, mới nhất trước |
| `history_user_favorite` | `user_id` ASC, `is_favorite` ASC | Lọc danh sách yêu thích theo user |

---

## Quan hệ giữa các collection

```
users._id  ←──────────────  history.user_id
                             (1 user → N history records)

history.session_id  ←──────  history.session_id
                             (1 session → 1–3 records, Research mode only)
```

**Research mode grouping:** Khi người dùng chạy Research với 3 provider, hệ thống tạo ra 3 document trong `history`, cùng `session_id` và `user_id`, khác nhau ở `provider` và `result`. Khi hiển thị, frontend group 3 document này lại thành 1 entry.

---

## Lưu ý thiết kế

| Vấn đề | Quyết định | Lý do |
|--------|-----------|-------|
| `_id` kiểu string UUID thay vì ObjectId | UUID v4 do ứng dụng sinh | Portable, không phụ thuộc MongoDB ObjectId |
| `result` lưu dạng embedded document | Embed thay vì reference | Test cases luôn được đọc cùng với metadata — tránh join |
| Refresh token | Không lưu DB | Stateless JWT — đổi bằng cách đặt TTL ngắn trên access token |
| Session cleanup | TTL 1 giờ trên job store in-memory | Job chỉ tồn tại đến khi client nhận kết quả, không cần persist |
