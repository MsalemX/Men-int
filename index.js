require("dotenv").config();

const { Telegraf } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");

// ── Supabase ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── Bot ───────────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);

// ── In-memory user state ──────────────────────────────────
// key = telegramId, value = { state, name, ... }
const userState = {};

// ── Helpers ───────────────────────────────────────────────
function getState(telegramId) {
  return userState[telegramId]?.state || "idle";
}

function setState(telegramId, state, extra = {}) {
  userState[telegramId] = { ...userState[telegramId], state, ...extra };
}

function isNumeric(str) {
  return /^\d+$/.test(str.trim());
}

// ── /start ────────────────────────────────────────────────
bot.start((ctx) => {
  const telegramId = String(ctx.from.id);
  setState(telegramId, "awaiting_name");
  ctx.reply(
    "مرحباً بك في بوت MN Int\n\nمن أنت؟\nأرسل رمز التسجيل للمتابعة."
  );
});

// ── /help ─────────────────────────────────────────────────
bot.help((ctx) => {
  ctx.reply(
    "📌 تعليمات البوت:\n\n" +
    "1️⃣ أرسل /start للتسجيل\n" +
    "2️⃣ أرسل اسمك عند السؤال\n" +
    "3️⃣ أرسل كود التسجيل من التطبيق\n" +
    "4️⃣ بعد التحقق، أرسل اسم أو رقم للبحث\n\n" +
    "📌 الأوامر:\n" +
    "/start - التسجيل\n" +
    "/search - تفعيل وضع البحث\n" +
    "/status - حالة التحقق\n" +
    "/info - معلومات البوت\n" +
    "/help - هذه التعليمات"
  );
});

// ── /info ─────────────────────────────────────────────────
bot.command("info", (ctx) => {
  ctx.reply(
    "🤖 بوت MN Int\n" +
    "الإصدار: 1.0.0\n" +
    "ال PURPOSE: البحث في قاعدة البيانات\n\n" +
    "🔗 رابط التطبيق:\nhttps://t.me/mn_int_bot"
  );
});

// ── /search ───────────────────────────────────────────────
bot.command("search", async (ctx) => {
  const telegramId = String(ctx.from.id);

  // Check if user is verified in activations table
  const { data: activation } = await supabase
    .from("activations")
    .select("is_activated")
    .eq("device_id", telegramId)
    .maybeSingle();

  if (!activation || !activation.is_activated) {
    return ctx.reply(
      "❌ يجب التحقق أولاً.\nأرسل /start للتسجيل."
    );
  }

  setState(telegramId, "search_mode");
  ctx.reply(
    "🔍 وضع البحث مفعّل\n\n" +
    "أرسل رقم هاتف للبحث عن الاسم\n" +
    "أو أرسل اسم للبحث عن رقم الهاتف"
  );
});

// ── /status ───────────────────────────────────────────────
bot.command("status", async (ctx) => {
  const telegramId = String(ctx.from.id);

  // Check user in users table
  const { data: user } = await supabase
    .from("users")
    .select("name")
    .eq("telegram_id", telegramId)
    .single();

  // Check activation status
  const { data: activation } = await supabase
    .from("activations")
    .select("is_activated")
    .eq("device_id", telegramId)
    .maybeSingle();

  if (!user) {
    return ctx.reply("❌ أنت غير مسجل.\nأرسل /start للتسجيل.");
  }

  const isVerified = activation?.is_activated ?? false;
  const status = isVerified ? "✅ متحقق" : "⏳ في انتظار التحقق";
  ctx.reply(
    `📋 حالة الحساب:\n\n` +
    `الاسم: ${user.name}\n` +
    `الحالة: ${status}`
  );
});

// ── Message handler ───────────────────────────────────────
bot.on("text", async (ctx) => {
  const telegramId = String(ctx.from.id);
  const text = ctx.message.text.trim();
  const currentState = getState(telegramId);

  // ── awaiting_name ──
  if (currentState === "awaiting_name") {
    if (text.startsWith("/")) return; // ignore commands

    const name = text;

    // Check if user exists
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramId)
      .single();

    let error;
    if (existing) {
      // Update only name, don't touch code
      ({ error } = await supabase
        .from("users")
        .update({ name: name })
        .eq("telegram_id", telegramId));
    } else {
      // Insert new user
      ({ error } = await supabase.from("users").insert({
        telegram_id: telegramId,
        name: name,
        verified: false,
      }));
    }

    if (error) {
      console.error("Supabase error:", error);
      return ctx.reply("❌ حدث خطأ. حاول مرة أخرى.");
    }

    setState(telegramId, "awaiting_code", { name });

    ctx.reply(
      `مرحباً ${name} 👋\n\n` +
      "قم بتنزيل التطبيق وإرسال كود التسجيل هنا.\n" +
      "أرسل الكود للمتابعة."
    );
    return;
  }

  // ── awaiting_code ──
  if (currentState === "awaiting_code") {
    if (text.startsWith("/")) return;

    const code = text;

    // Check code in activations table (Flutter app stores it there)
    const { data: activation, error: actError } = await supabase
      .from("activations")
      .select("id, activation_code, is_activated")
      .eq("activation_code", code)
      .maybeSingle();

    if (actError || !activation) {
      return ctx.reply(
        "❌ كود غير صحيح.\n\n" +
        "تأكد من الكود وأرسله مرة أخرى."
      );
    }

    if (activation.is_activated) {
      setState(telegramId, "verified");
      return ctx.reply(
        "✅ تم التحقق بنجاح!\n\n" +
        "يمكنك الآن البحث.\n" +
        "أرسل رقم هاتف أو اسم للبحث."
      );
    }

    // Mark as verified
    const { error: updateError } = await supabase
      .from("activations")
      .update({ is_activated: true })
      .eq("id", activation.id);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return ctx.reply("❌ حدث خطأ أثناء التحقق.");
    }

    setState(telegramId, "verified");
    ctx.reply(
      "✅ تم التحقق بنجاح!\n\n" +
      "يمكنك الآن البحث.\n" +
      "أرسل رقم هاتف أو اسم للبحث."
    );
    return;
  }

  // ── verified / search_mode ──
  if (currentState === "verified" || currentState === "search_mode") {
    if (text.startsWith("/")) return;

    // Search by phone number - handle multiple formats
    if (isNumeric(text)) {
      // Clean the input
      let clean = text.replace(/^967/, "").replace(/^\+/, ""); // remove leading 967 or +

      // Try multiple search patterns
      const { data: results, error } = await supabase
        .from("contacts")
        .select("name, phone")
        .or(`phone.eq.${clean},phone.eq.967${clean},phone.eq.+967${clean},phone.eq.${text},phone.like.%${clean}%`)
        .limit(10);

      if (error) {
        console.error("Supabase search error:", error);
        return ctx.reply("❌ حدث خطأ أثناء البحث.");
      }

      if (!results || results.length === 0) {
        return ctx.reply("🔍 لم يتم العثور على نتائج.");
      }

      let msg = `🔍 نتائج البحث (${results.length}):\n\n`;
      results.forEach((r, i) => {
        msg += `${i + 1}. ${r.name}\n   📞 ${r.phone}\n\n`;
      });

      ctx.reply(msg);
      return;
    }

    // Search by name - exact match only
    const { data: results, error } = await supabase
      .from("contacts")
      .select("name, phone")
      .eq("name", text)
      .limit(10);

    if (error) {
      console.error("Supabase search error:", error);
      return ctx.reply("❌ حدث خطأ أثناء البحث.");
    }

    if (!results || results.length === 0) {
      return ctx.reply("🔍 لم يتم العثور على نتائج.");
    }

    let msg = `🔍 نتائج البحث (${results.length}):\n\n`;
    results.forEach((r, i) => {
      msg += `${i + 1}. ${r.name}\n   📞 ${r.phone}\n\n`;
    });

    ctx.reply(msg);
    return;
  }

  // ── idle (not registered) ──
  ctx.reply("أرسل /start للتسجيل في البوت.");
});

// ── Error handling ────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply("❌ حدث خطأ غير متوقع. حاول لاحقاً.");
});

// ── Graceful shutdown ─────────────────────────────────────
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// ── Launch ────────────────────────────────────────────────
bot.launch().then(() => {
  console.log("🤖 Bot started successfully");
  console.log(`   @mn_int_bot`);
});
