# MN Int Telegram Bot

Bot connected to Supabase for searching data.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:
```
BOT_TOKEN=your_telegram_bot_token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
```

### 3. Supabase Tables

**users table:**
```sql
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id TEXT UNIQUE NOT NULL,
  name TEXT,
  code TEXT,
  verified BOOLEAN DEFAULT false
);
```

**data table:**
```sql
CREATE TABLE data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  phone TEXT
);
```

### 4. Run the bot
```bash
npm start
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Register / begin verification |
| `/help` | Show instructions |
| `/search` | Enable search mode |
| `/status` | Check verification status |
| `/info` | Bot information |

## Flow

1. User sends `/start`
2. Bot asks for name
3. User sends name
4. Bot asks for registration code
5. User sends code from app
6. Bot verifies code against Supabase
7. User can now search by phone or name
