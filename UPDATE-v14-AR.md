# Vintage.io v14 — سيرفرات مستقلة + Physics Presets (المرحلة 2 و4 جزئيًا)

## اللي اتغير
- `public/physics.js` (مصدر الفيزيكس الوحيد): أضفت `PHYSICS_PRESETS` (vintage_ffa, senpa, classic, aster, senpa_mega, aster_mega, arab, gota, macro). **Dual وMega مبقوش بيستخدموا فيزيكس FFA.**
- `server/servers.config.json`: سجل 17 سيرفر في 6 تصنيفات (FFA, Dual, Mega Split, Macro, Classic/OG, Competitive Bot-Free). Domination جوه Dual.
- `server/core.cjs`: `loadRegistry()` بيتحقق من الـ Config (id مكرر، preset غلط، تصنيف غلط، سيرفر Competitive فيه بوتات/ماكرو = خطأ وقت التشغيل).
- `server/index.js`: غرفة مستقلة لكل سيرفر، الانضمام بـ `serverId` (والعملاء القدام بـ `mode` لسه شغالين)، `GET /servers` و`GET /health` بأرقام حقيقية، وغرفة لو وقعت بتتعزل ومتوقفش الباقي، وحد أقصى للاعبين، وسرعة Eject لكل سيرفر (Macro أسرع).

## تشغيل
    cd server && npm install && npm start
    node --test tests/*.test.cjs        # 48 اختبار

## مهم — الصراحة
- قيم الـ Presets دي **قيم Vintage المبدئية للضبط**، مش قياسات حقيقية من Senpa/Aster/Gota/Arab. لازم تتضبط باللعب.
- الواجهة (Server Browser والتصنيفات) **لسه ماتعدّلتش**. الباك إند جاهز وبيرجع التصنيفات من `/servers`، والمرحلة الجاية تربطها.
- 17 غرفة × 10 بوتات في عملية واحدة: **ماتقاسش استهلاك الـ CPU على VPS** لسه.
- لسه مفيش: قاعدة بيانات، لوحة إدارة، اشتراكات، تعديل الفيزيكس من لوحة، اختبار بصري.
