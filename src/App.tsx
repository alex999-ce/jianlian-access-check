import {apiFetch, portableBackup, importPhotos} from "./backend";
import {PrivatePhoto} from "./auth";
import { useEffect, useRef, useState } from "react";
import { Activity, BarChart3, Camera, Check, Dumbbell, House, Leaf, PersonStanding, Plus, Settings2, Sparkles } from "lucide-react";
import { defaultShortPlan, emptyData, foodAlerts, readBackup, mealTotals, saveDailyTraining, type Exercise, type FitnessData, type Food, type Meal, type ShortPlan } from "./lib/fitness";

type Page = "today" | "training" | "food" | "records" | "posture" | "stats" | "coach" | "settings";
const nav = [{ id: "today", label: "今日", icon: House }, { id: "training", label: "训练", icon: Dumbbell }, { id: "coach", label: "教练", icon: Sparkles }, { id: "posture", label: "姿态", icon: PersonStanding }, { id: "records", label: "记录", icon: Camera }, { id: "stats", label: "统计", icon: BarChart3 }] as const;
const names: Record<Page, string> = { today: "今日", training: "训练计划", food: "饮食记录", records: "记录", posture: "姿态自查", stats: "统计", coach: "AI教练", settings: "设置" };
const sub: Record<Page, string> = { today: "", training: "先选模式，再按当天推荐动作练，可随时增删改成你想要的", food: "拍照或填写，确认份量后保存", records: "体态照每周一组，饮食每餐一记", posture: "每天3次自查，8周养成习惯", stats: "看趋势与坚持，不看单日，4–8周见分晓", coach: "了解你的训练和饮食记录，随时问", settings: "参考范围与数据备份" };
const mealNames: Record<string, string> = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" };
const postureGuides = [
  { type: "standing", title: "站姿自查", groups: [
    ["双脚与肩同宽，重量均匀落在全脚掌", "脚尖微微向外；膝盖放松，不锁死。"],
    ["骨盆微后倾：尾巴骨向下收，轻轻夹屁股", "不刻意撅肚子、不塌腰；这是骨盆中立的起始位置。"],
    ["肩膀下沉远离耳朵，胸腔微微打开", "不含胸、不耸肩；肩胛骨轻微向后向下收。"],
    ["站着时悄悄做 10 秒真空腹", "呼气把肚脐往脊柱方向吸，温和练习深层核心。"],
  ] },
  { type: "sitting", title: "坐姿自查", groups: [
    ["屁股完全坐满椅面，双脚平放地面与肩同宽", "膝盖自然弯曲；不翘二郎腿、不盘腿。"],
    ["骨盆回到舒适的中立位置", "坐稳，让腰背有支撑，不要持续用力夹紧肌肉。"],
    ["屏幕上沿与视线平齐，不低头含胸", "每坐 40 分钟起身活动 2 分钟。"],
  ] },
  { type: "bedtime", title: "睡前自查", groups: [
    ["选择舒适的睡姿", "侧卧时可以在双腿之间夹个枕头。"],
    ["睡前可做温和放松", "髂腰肌拉伸、婴儿式、腹横肌呼吸。"],
    ["发现偏了，轻轻调整即可", "不刻意持续发力；肌肉记忆需要时间形成。"],
  ] },
];
const nowDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const display = (x: number | null | undefined, unit: string) => x == null ? "未估算" : `${Math.round(x)} ${unit}`;
const asNumber = (x: unknown) => x === "" || x == null || !Number.isFinite(Number(x)) ? null : Math.max(0, Number(x));
const readJson = (response: Response): Promise<any> => response.json();
async function downloadBackup(data: FitnessData) {
  const backup = await portableBackup(data);
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `jianlian-backup-${nowDate()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
function resizeFood(food: Food, input: string): Food {
  const grams = asNumber(input);
  if (!grams || !food.grams) return { ...food, grams };
  const ratio = grams / food.grams;
  return { ...food, grams, nutrients: Object.fromEntries(Object.entries(food.nutrients).map(([key, value]) => [key, value === null ? null : Math.round(value * ratio * 10) / 10])) as Food["nutrients"] };
}
const photoUrl = (meal: Meal) => meal.photoUrl?.startsWith("/spark/app/") ? `https://4kythghe7mkmv.doubaoapps.com${meal.photoUrl}` : "";

export default function Home() {
  const [page, setPage] = useState<Page>("today");
  const [data, setData] = useState<FitnessData>(emptyData);
  const [date, setDate] = useState(nowDate());
  const [mode, setMode] = useState<"normal" | "light" | "free">("normal");
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const [description, setDescription] = useState("");
  const [mealType, setMealType] = useState("lunch");
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [recordTab, setRecordTab] = useState<"posture" | "food">("posture");
  const [showHistory, setShowHistory] = useState(false);
  const [editingExercise, setEditingExercise] = useState<number | null>(null);
  const [editingTheme, setEditingTheme] = useState(false);
  const [themeDraft, setThemeDraft] = useState("");
  const [exerciseDraft, setExerciseDraft] = useState<Exercise>({name:"",target:"",totalSets:3,reps:"12"});
  const [editingWarmup, setEditingWarmup] = useState(false);
  const [actualDaySelection, setActualDaySelection] = useState<{date:string;mode:string;day:number}|null>(null);
  const [showTrainingHistory, setShowTrainingHistory] = useState(false);
  const [statsMonth, setStatsMonth] = useState(nowDate().slice(0,7));
  const [postureFiles, setPostureFiles] = useState<Record<string, File | null>>({front:null,side:null,back:null});
  const [waistCm, setWaistCm] = useState("");
  const [postureNote, setPostureNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [estimateNote, setEstimateNote] = useState("");
  const [newExercise, setNewExercise] = useState("");
  const [freeRequest, setFreeRequest] = useState("");
  const [coachQuestion, setCoachQuestion] = useState("");
  const [coachAnswer, setCoachAnswer] = useState("");
  const [importText, setImportText] = useState("");
  const [shortPlanDraft, setShortPlanDraft] = useState<ShortPlan | null>(null);

  useEffect(() => { apiFetch("/api/state", { cache: "no-store" }).then(async (response) => { if (response.status === 401) { setSignedIn(false); return; } if (!response.ok) throw new Error("读取记录失败"); const result = await readJson(response); setData(result.data); revision.current = result.revision; }).catch((error) => setNotice(error.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!photo) { setPreview(""); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);

  async function save(next: FitnessData) {
    setBusy(true); setNotice("");
    try { const response = await apiFetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: next, revision: revision.current }) }); const result = await readJson(response); if (!response.ok) throw new Error(result.error ?? "保存失败"); revision.current = result.revision; setData(next); setNotice("已保存"); return true; }
    catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); return false; }
    finally { setBusy(false); }
  }

  async function importData(input: File | string) {
    setBusy(true); setNotice("正在导入旧记录和照片…");
    try { const raw = JSON.parse(typeof input === "string" ? input : await input.text()); const next = readBackup(await importPhotos(raw));
      for (const meal of next.meals.filter((item) => item.photoUrl && !item.photoKey)) { const response = await apiFetch("/api/photo/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: meal.photoUrl }) }); if (!response.ok) throw new Error("照片迁移失败，原有记录未替换，请稍后重试"); meal.photoKey = (await readJson(response)).key; }
      const response = await apiFetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: next, revision: revision.current }) }); const result = await readJson(response); if (!response.ok) throw new Error(result.error); revision.current = result.revision; setData(next); setPage("today"); setNotice(`已导入 ${next.meals.length} 条饮食、${next.trainingRecords.length} 条训练、${next.coachMessages.length} 条对话`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "导入失败"); } finally { setBusy(false); }
  }

  async function analyzeFood() {
    if (!photo && !description.trim()) { setNotice("请上传照片或描述食物"); return; }
    setBusy(true); setNotice("正在识别…");
    try { const form = new FormData(); if (photo) form.append("photo", photo); form.append("description", description); const response = await apiFetch("/api/analyze", { method: "POST", body: form }); const result = await readJson(response); if (!response.ok) throw new Error(result.error); setFoods(result.foods.map((item: Record<string, unknown>) => ({ id: crypto.randomUUID(), name: String(item.name ?? ""), grams: asNumber(item.grams), confidence: item.confidence === "高" || item.confidence === "中" ? item.confidence : "低", note: String(item.note ?? ""), nutrients: { kcal: asNumber(item.kcal), protein: asNumber(item.protein), carbs: asNumber(item.carbs), sodium: asNumber(item.sodium), potassium: asNumber(item.potassium) } }))); setEstimateNote(String(result.overallNote ?? "")); setNotice("识别完成，请核对食物和克数"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "识别失败"); } finally { setBusy(false); }
  }

  async function saveMeal() {
    if (!description.trim() && !foods.length && !photo) { setNotice("请填写食物或上传照片"); return; }
    setBusy(true); try { let key: string | undefined; if (photo) { const form = new FormData(); form.append("photo", photo); const response = await apiFetch("/api/photo", { method: "POST", body: form }); const result = await readJson(response); if (!response.ok) throw new Error(result.error); key = result.key; }
      const existing = data.meals.find((item) => item.id === editingMealId);
      const meal: Meal = { id: existing?.id ?? crypto.randomUUID(), date, type: mealType, description, foods, legacyCalories: existing?.legacyCalories ?? null, legacyProtein: existing?.legacyProtein ?? null, photoKey: key ?? existing?.photoKey, photoUrl: existing?.photoUrl, createdAt: existing?.createdAt ?? new Date().toISOString() }; const okay = await save({ ...data, meals: editingMealId ? data.meals.map((item) => item.id === editingMealId ? meal : item) : [meal, ...data.meals] }); if (okay) { setDescription(""); setPhoto(null); setFoods([]); setEstimateNote(""); setEditingMealId(null); setPage("records"); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); } finally { setBusy(false); }
  }

  function changeTrainingDay(change: { theme?: string; items?: Exercise[] }) {
    if (!trainingDay) return;
    save(saveDailyTraining(data, date, mode, change.theme ?? trainingDay.theme, change.items ?? trainingDay.items, selectedPlanDay));
  }

  function selectTrainingDate(day: string) {
    if (!day) return;
    setDate(day); setEditingExercise(null); setEditingTheme(false);
    const record = data.trainingRecords.find((item) => item.recordDate === day);
    if (record) setMode(record.mode === "free" ? "free" : record.mode === "light" ? "light" : "normal");
  }
  function shiftTrainingDate(delta: number) {
    const next = new Date(`${date}T12:00:00+08:00`);
    next.setUTCDate(next.getUTCDate() + delta);
    selectTrainingDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(next));
  }
  function saveFreeItems(items: Array<Record<string, unknown>>) {
    const current = freePlan ?? { id: crypto.randomUUID(), planDate: date, source: "manual", items: [], userInput: "" };
    const next = saveDailyTraining(data, date, "free", "自由训练", items.map((item) => ({ ...item, name: String(item.name ?? item.exerciseName ?? "动作"), totalSets: Number(item.totalSets ?? item.sets ?? 3), reps: String(item.reps ?? "按需") })));
    save({ ...next, freePlans: [...data.freePlans.filter((item) => item.planDate !== date), { ...current, items }] });
  }

  async function generateFreePlan() {
    if (!freeRequest.trim()) return;
    setBusy(true); setNotice("正在生成训练草稿…");
    try { const response = await apiFetch("/api/free-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: freeRequest }) }); const result = await readJson(response); if (!response.ok) throw new Error(result.error); const plan = { id: crypto.randomUUID(), planDate: date, source: "ai", userInput: freeRequest, items: result.items, createdAt: new Date().toISOString() }; await save({ ...data, freePlans: [...data.freePlans.filter((item) => item.planDate !== date), plan] }); setNotice("草稿已生成，请核对动作是否适合今天的身体状况"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "生成失败"); }
    finally { setBusy(false); }
  }

  const meals = data.meals.filter((meal) => meal.date === date);
  const records = data.trainingRecords.filter((record) => record.recordDate === date);
  const weekday = new Date(`${date}T12:00:00+08:00`).getDay() || 7;
  const weekDates = Array.from({ length: 7 }, (_, index) => { const day = new Date(`${date}T12:00:00+08:00`); day.setUTCDate(day.getUTCDate() + index + 1 - weekday); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(day); });
  const dayLabels = ["一", "二", "三", "四", "五", "六", "日"];
  const postureCount = new Set(data.posture.filter((item) => item.date === date).map((item) => item.type)).size;
  const shortPlan = data.shortPlan ?? defaultShortPlan;
  const externalDiet = Boolean(shortPlan.dietApp.trim());
  const loopTotal = externalDiet ? 3 : 4;
  const completedLoops = Number(records.some((item) => item.completed)) + Number(postureCount > 0) + Number(!externalDiet && data.completedDates.includes(date)) + Number(data.photos.some((item) => item.weekStart===weekDates[0] || weekDates.includes(String(item.date))));
  const plan = mode === "free" ? null : data.plans[mode];
  const dayRecord = records.find((record) => record.mode === mode);
  const completedExercises = dayRecord?.exercises.filter((item) => (item.completedSets ?? 0) > 0).length ?? 0;
  const selectedPlanDay = actualDaySelection?.date===date && actualDaySelection.mode===mode ? actualDaySelection.day : Number(data.actualPlanDays?.[`${date}-${mode}`] ?? dayRecord?.planDayOfWeek ?? weekday);
  const templateDay = plan?.days.find((day) => day.dayOfWeek === selectedPlanDay);
  const trainingDay = mode === "free" ? null : dayRecord ? { ...templateDay, dayOfWeek: selectedPlanDay, theme: dayRecord.theme, items: dayRecord.exercises } : templateDay;
  const freePlan = data.freePlans.find((item) => item.planDate === date);
  const freeItems = freePlan?.items ?? (mode === "free" ? dayRecord?.exercises : undefined) ?? [];
  const [statsYear,statsMonthNumber] = statsMonth.split("-").map(Number);
  const statsDays = new Date(statsYear,statsMonthNumber,0).getDate();
  const statsOffset = new Date(statsYear,statsMonthNumber-1,1).getDay();
  function moveStatsMonth(change:number) { const next=new Date(statsYear,statsMonthNumber-1+change,1); setStatsMonth(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}`); }
  async function savePosturePhotos() {
    if (!Object.values(postureFiles).some(Boolean) && !waistCm.trim()) return;
    setBusy(true);
    try {
      const uploaded: Record<string,string> = {};
      for (const side of ["front","side","back"]) { const file = postureFiles[side]; if (!file) continue; const form = new FormData(); form.append("photo",file); const response = await apiFetch("/api/photo",{method:"POST",body:form}); const result = await readJson(response); if (!response.ok) throw new Error(result.error); uploaded[`${side}Key`] = result.key; }
      const existing = data.photos.find((item)=>item.weekStart===weekDates[0]);
      const entry = {...existing,id:existing?.id??crypto.randomUUID(),date,weekStart:weekDates[0],waistCm:asNumber(waistCm),note:postureNote,...uploaded};
      const okay = await save({...data,photos:existing?data.photos.map((item)=>item.id===existing.id?entry:item):[...data.photos,entry]});
      if (okay) { setPostureFiles({front:null,side:null,back:null}); setWaistCm(""); setPostureNote(""); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); } finally { setBusy(false); }
  }
  async function saveInlineMeal(type: string, text: string, file: File | null, existing?: Meal) {
    if (!text.trim() && !file && !existing?.photoKey && !existing?.photoUrl) return;
    setBusy(true);
    try {
      let key = existing?.photoKey;
      if (file) { const form = new FormData(); form.append("photo",file); const response = await apiFetch("/api/photo",{method:"POST",body:form}); const result = await readJson(response); if (!response.ok) throw new Error(result.error); key = result.key; }
      const meal: Meal = { id: existing?.id ?? crypto.randomUUID(), date, type, description:text, foods:existing?.foods ?? [], legacyCalories:existing?.legacyCalories ?? null, legacyProtein:existing?.legacyProtein ?? null, photoKey:key, photoUrl:existing?.photoUrl, createdAt:existing?.createdAt ?? new Date().toISOString() };
      await save({...data,meals:existing?data.meals.map((item)=>item.id===existing.id?meal:item):[meal,...data.meals]});
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); } finally { setBusy(false); }
  }
  function beginMeal(type: string, meal?: Meal) { setMealType(type); setEditingMealId(meal?.id ?? null); setDescription(meal?.description ?? ""); setFoods(meal?.foods ?? []); setPhoto(null); setPage("food"); }
  function toggleExercise(index: number) {
    if (!trainingDay) return;
    const base = dayRecord?.exercises ?? trainingDay.items.map((item) => ({ ...item, completedSets: 0 }));
    const exercises = base.map((item, i) => i === index ? { ...item, completedSets: (item.completedSets ?? 0) > 0 ? 0 : Number(item.totalSets ?? 1) } : item);
    const record = { ...(dayRecord ?? { id: crypto.randomUUID(), recordDate: date, dayOfWeek: weekday, planDayOfWeek:selectedPlanDay, theme: trainingDay.theme, mode }), exercises, completed: exercises.length > 0 && exercises.every((item) => (item.completedSets ?? 0) > 0) };
    save({ ...data, trainingRecords: dayRecord ? data.trainingRecords.map((item) => item.id === dayRecord.id ? record : item) : [record, ...data.trainingRecords] });
  }
  function toggleWarmup() {
    if (!trainingDay) return;
    const record = { ...(dayRecord ?? { id: crypto.randomUUID(), recordDate: date, dayOfWeek: weekday, planDayOfWeek:selectedPlanDay, theme: trainingDay.theme, mode, completed: false, exercises: trainingDay.items.map((item) => ({ ...item, completedSets: 0 })) }), warmupCompleted: !dayRecord?.warmupCompleted };
    save({ ...data, trainingRecords: dayRecord ? data.trainingRecords.map((item) => item.id === dayRecord.id ? record : item) : [record, ...data.trainingRecords] });
  }

  return <div className="app"><div className="main"><header className="app-header"><span>私人记录</span><button aria-label={page === "settings" ? "返回" : "设置"} onClick={()=>setPage(page === "settings" ? "today" : "settings")}>{page === "settings" ? "返回" : <Settings2 size={17}/>}</button></header><main className="content">{page !== "today" && <div className="intro"><h1>{names[page]}</h1><p>{page==="records"&&externalDiet?"体态照每周一组，饮食历史可回看":sub[page]}</p></div>}{notice && <div role="status" className="notice">{notice}<button aria-label="关闭提示" onClick={()=>setNotice("")}>×</button></div>}
  {loading && <section className="card">正在读取记录…</section>}
  {!loading && !signedIn && <section className="card"><h2>请重新登录</h2><p>登录状态已失效，请点击顶部退出登录后重新登录。</p></section>}
  {!loading && signedIn && page === "today" && <>
    <div className="home-heading"><div><small>周{dayLabels[weekday-1]} · {date.slice(5).replace("-","/")} · {mode === "light" ? "轻度训练" : mode === "free" ? "自由训练" : "正常训练"}</small><h1>今天练：{trainingDay?.theme ?? "自由训练"}</h1></div><span>完成 {completedLoops}/{loopTotal}</span></div>
    <section className="card daily-loop"><div className="loop-art"><span className="orbit-icon orbit-top"><Dumbbell size={17}/></span><span className="orbit-icon orbit-right"><PersonStanding size={17}/></span>{!externalDiet&&<span className="orbit-icon orbit-bottom"><Leaf size={17}/></span>}<span className="orbit-icon orbit-left"><Camera size={17}/></span><div className="loop-ring"><strong>{completedLoops}/{loopTotal}</strong><small>今日闭环</small></div></div><div className="loop-labels"><span>训练</span><span>姿态</span>{!externalDiet&&<span>饮食</span>}<span>体态周照</span></div></section>
    <button className="card home-link" onClick={()=>setPage("training")}><span className="icon-tile"><Dumbbell size={19}/></span><span><strong>{trainingDay?.theme ?? "今日训练计划"}</strong><small>{trainingDay?.items.map((item)=>item.target).filter(Boolean).slice(0,3).join(" · ") || "查看今天的动作"}</small><em>动作完成度 {completedExercises}/{trainingDay?.items.length ?? 0}</em></span><b>›</b></button>
    <section className="card body-card"><h2><span className="icon-tile"><Activity size={18}/></span> 今日身体数据（选填）</h2><p>体重和步数，用于查看你的长期变化</p><div className="field-grid"><Edit label="体重 (kg)" number value={data.profile.weightKg??""} onChange={(value)=>setData({...data,profile:{...data.profile,weightKg:asNumber(value)??undefined}})}/><Edit label="步数 (步)" number value={String(data.metrics.find((item)=>item.date===date)?.steps??"")} onChange={(value)=>setData({...data,metrics:[...data.metrics.filter((item)=>item.date!==date),{date,steps:asNumber(value)}]})}/></div><button className="secondary" onClick={()=>save(data)}>保存身体数据</button></section>
    <button className="card home-link" onClick={()=>setPage("posture")}><span className="icon-tile"><PersonStanding size={19}/></span><span><strong>姿态自查</strong><small>站姿 · 坐姿 · 睡前放松</small></span><b>›</b></button>
    <section className="card short-plan"><div className="card-head"><h2>短期计划 · {shortPlan.title}</h2>{!shortPlanDraft&&<button className="secondary" onClick={()=>setShortPlanDraft({...shortPlan})}>编辑短期计划</button>}</div>{shortPlanDraft?<><Edit label="计划名称" value={shortPlanDraft.title} onChange={(value)=>setShortPlanDraft({...shortPlanDraft,title:value})}/><label className="field">训练目标<textarea rows={3} value={shortPlanDraft.goal} onChange={(event)=>setShortPlanDraft({...shortPlanDraft,goal:event.target.value})}/></label><label className="field">训练安排<textarea rows={4} value={shortPlanDraft.content} onChange={(event)=>setShortPlanDraft({...shortPlanDraft,content:event.target.value})}/></label><Edit label="每日热量缺口目标 kcal" number value={shortPlanDraft.calorieDeficit} onChange={(value)=>setShortPlanDraft({...shortPlanDraft,calorieDeficit:asNumber(value)??0})}/><Edit label="饮食记录 App（留空表示在本软件记录）" value={shortPlanDraft.dietApp} onChange={(value)=>setShortPlanDraft({...shortPlanDraft,dietApp:value})}/><div className="actions"><button className="primary" disabled={busy||!shortPlanDraft.title.trim()} onClick={async()=>{if(await save({...data,shortPlan:shortPlanDraft}))setShortPlanDraft(null)}}>保存短期计划</button><button className="secondary" disabled={busy} onClick={()=>setShortPlanDraft(null)}>取消编辑</button></div></>:<><p><strong>目标</strong>　{shortPlan.goal}</p><p className="plan-content"><strong>安排</strong>　{shortPlan.content}</p><p><strong>每日热量缺口目标</strong>　约 {shortPlan.calorieDeficit} 千卡（个人设定）</p><p><strong>饮食记录</strong>　{shortPlan.dietApp||"本软件"}</p><button className="secondary" onClick={()=>setPage("training")}>查看当天训练</button></>}</section>
    <button className="card home-link" onClick={()=>{setPage("records");setRecordTab("posture")}}><span className="icon-tile"><Camera size={19}/></span><span><strong>体态周照</strong><small>本周记录 {data.photos.length ? "已保存" : "还没拍"}</small></span><b>›</b></button>
    <button className="card home-link" onClick={()=>{setPage("records");setRecordTab("food")}}><span className="icon-tile"><Leaf size={19}/></span><span><strong>{externalDiet?"历史饮食记录":"饮食记录"}</strong><small>{externalDiet?`饮食使用${shortPlan.dietApp}，这里保留原有历史`:`今天已记 ${meals.length} 餐`}</small></span><b>›</b></button>
    <section className="card nutrition-card"><h2>{externalDiet?"饮食安排":"今天的饮食提醒"}</h2>{foodAlerts(data,date).map((item,index)=><p className="callout" key={index}>{item}</p>)}{externalDiet?<p className="fine">饮食不计入本软件的每日打卡，无需重复记录。</p>:<p className="fine">外卖可选番茄炒蛋、鸡腿和西兰花，搭配适量米饭、红薯或土豆；下单时请店家少盐、酱汁分开。</p>}</section>
  </>}
  {!loading && signedIn && page === "food" && <><div className="columns"><section className="card"><span className="eyebrow">NEW ENTRY</span><h2>记录这一餐</h2><div className="segmented">{Object.entries(mealNames).map(([key,label])=><button key={key} className={mealType===key?"active":""} onClick={()=>setMealType(key)}>{label}</button>)}</div><label className="upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>setPhoto(event.target.files?.[0]??null)}/>{preview?<img src={preview} alt="待记录餐食"/>:<><Camera size={27}/><strong>拍照或上传餐食</strong><small>识别结果需要你确认</small></>}</label><label className="field">吃了什么？<textarea rows={3} value={description} onChange={(event)=>setDescription(event.target.value)} placeholder="例如：番茄炒蛋、卤鸡腿、西兰花、半碗米饭"/></label><div className="actions"><button className="secondary" onClick={analyzeFood} disabled={busy}><Sparkles size={16}/> AI 识别份量</button><button className="primary" onClick={saveMeal} disabled={busy}><Check size={16}/> 保存这一餐</button></div><p className="fine">照片无法精确测出重量、油盐与配方；未确定的值会留空。</p></section><section className="card"><span className="eyebrow">REVIEW</span><h2>确认食物与克数</h2>{estimateNote && <p className="callout">{estimateNote}</p>}{foods.length===0?<p className="empty">识别后在这里核对，也可手动添加食物。</p>:foods.map((food,index)=><div className="food-row" key={food.id}><div className="row-title"><strong>{food.name||"新食物"}</strong><small>可信度{food.confidence}</small></div><div className="field-grid"><Edit label="名称" value={food.name} onChange={(value)=>setFoods(foods.map((item,i)=>i===index?{...item,name:value}:item))}/><Edit label="克数 g" value={food.grams??""} number onChange={(value)=>setFoods(foods.map((item,i)=>i===index?resizeFood(item,value):item))}/>{(["kcal","protein","carbs","sodium","potassium"] as const).map((key)=><Edit key={key} label={({kcal:"千卡",protein:"蛋白 g",carbs:"碳水 g",sodium:"钠 mg",potassium:"钾 mg"})[key]} value={food.nutrients[key]??""} number onChange={(value)=>setFoods(foods.map((item,i)=>i===index?{...item,nutrients:{...item.nutrients,[key]:asNumber(value)}}:item))}/>)}</div><p className="fine">{food.note}</p><button className="text-danger" onClick={()=>setFoods(foods.filter((_,i)=>i!==index))}>移除</button></div>)}<button className="link-button" onClick={()=>setFoods([...foods,{id:crypto.randomUUID(),name:"",grams:null,confidence:"低",nutrients:{kcal:null,protein:null,carbs:null,sodium:null,potassium:null}}])}><Plus size={15}/> 手动添加食物</button></section></div><section className="card"><span className="eyebrow">THIS DAY</span><h2>{date} · 已记 {meals.length} 餐</h2>{meals.length?meals.map((meal)=><MealView key={meal.id} meal={meal} onDelete={()=>save({...data,meals:data.meals.filter((item)=>item.id!==meal.id)})}/>):<p className="empty">这一天还没有饮食记录。</p>}<label className="checkline"><input type="checkbox" checked={data.completedDates.includes(date)} onChange={(event)=>save({...data,completedDates:event.target.checked?[...data.completedDates,date]:data.completedDates.filter((item)=>item!==date)})}/> 今天的餐食已经记全</label></section></>}
  {!loading && signedIn && page === "training" && <>
    <button className="training-history-link" onClick={()=>setShowTrainingHistory(!showTrainingHistory)}>历史记录 ›</button>
    {showTrainingHistory&&<section className="card training-history"><h3>训练历史</h3>{[...data.trainingRecords].sort((a,b)=>b.recordDate.localeCompare(a.recordDate)).map((record)=><button key={record.id} onClick={()=>{setDate(record.recordDate);setMode(record.mode==="light"?"light":record.mode==="free"?"free":"normal");setShowTrainingHistory(false)}}><strong>{record.recordDate}</strong><span>{record.theme} · {record.completed?"已完成":"未完成"}</span></button>)}</section>}
    <div className="mode-tabs">{(["light","normal","free"] as const).map((item)=><button key={item} className={mode===item?"active":""} onClick={()=>{setMode(item);setEditingExercise(null)}}>{({normal:"正常模式",light:"轻度模式",free:"自由训练"})[item]}</button>)}</div>
    <section className="card training-date-picker"><label>训练日期<input aria-label="训练日期" type="date" value={date} onChange={(event)=>selectTrainingDate(event.target.value)}/></label><div className="actions"><button className="secondary" onClick={()=>shiftTrainingDate(-1)}>前一天</button><button className="secondary" onClick={()=>selectTrainingDate(nowDate())}>今天</button><button className="secondary" onClick={()=>shiftTrainingDate(1)}>后一天</button></div></section>
    <div className="week-strip">{weekDates.map((day,index)=><button key={day} aria-label={`${day} 周${dayLabels[index]}`} className={date===day?"active":""} onClick={()=>selectTrainingDate(day)}><small>周{dayLabels[index]}</small><strong>{day.slice(5).replace("-","/")}</strong></button>)}</div>
    {mode !== "free" ? <>
      <label className="actual-day">采用周模板：<select value={selectedPlanDay} onChange={(event)=>{const day=Number(event.target.value);const selected=data.plans[mode]?.days.find((item)=>item.dayOfWeek===day);setActualDaySelection({date,mode,day});if(selected)save({...saveDailyTraining(data,date,mode,selected.theme,selected.items,day),actualPlanDays:{...(data.actualPlanDays??{}),[`${date}-${mode}`]:day}})}}>{dayLabels.map((label,index)=><option key={index} value={index+1}>周{label} · {data.plans[mode]?.days.find((item)=>item.dayOfWeek===index+1)?.theme??"休息"}</option>)}</select></label>
      <div className="training-title"><div>{editingTheme ? <div className="inline-edit"><input value={themeDraft} onChange={(event)=>setThemeDraft(event.target.value)}/><button className="secondary" onClick={()=>{changeTrainingDay({theme:themeDraft.trim()||"训练"});setEditingTheme(false)}}>保存</button></div> : <h2>{trainingDay?.theme??"这一天没有训练"} <button className="icon-button" aria-label="编辑主题" onClick={()=>{setThemeDraft(trainingDay?.theme??"");setEditingTheme(true)}}>✎</button></h2>}</div><small>周{dayLabels[weekday-1]} · {date.slice(5).replace("-","月")}日</small></div>
      <section className="card warmup-card"><div className="card-head"><h3>🔥 训练前 10 分钟启动</h3><button className="text-button" onClick={()=>setEditingWarmup(!editingWarmup)}>✎ 编辑</button><button className={dayRecord?.warmupCompleted?"status done":"status"} onClick={toggleWarmup}>{dayRecord?.warmupCompleted?"热身已完成":"标记热身完成"}</button></div>{data.warmup.map((item,index)=><div className="warmup-line" key={index}>{editingWarmup?<><input value={String(item.name??"")} onChange={(event)=>setData({...data,warmup:data.warmup.map((part,i)=>i===index?{...part,name:event.target.value}:part)})}/><input value={String(item.detail??"")} onChange={(event)=>setData({...data,warmup:data.warmup.map((part,i)=>i===index?{...part,detail:event.target.value}:part)})}/></>:<><b>•</b><strong>{String(item.name??"热身")}</strong><span> · {String(item.detail??"")}</span></>}</div>)}{editingWarmup&&<button className="secondary" onClick={()=>{save(data);setEditingWarmup(false)}}>保存热身</button>}</section>
      {trainingDay?.items.map((exercise,index)=><section className="card original-exercise" key={`${date}-${mode}-${index}`}><div className="exercise-head"><strong>{exercise.name}</strong><span>{Number(exercise.shoulderLoad??0)===0?"几乎无肩压":"低肩压"}</span></div><div className="exercise-actions"><button className="text-danger" onClick={()=>changeTrainingDay({items:trainingDay.items.filter((_,i)=>i!==index)})}>删除动作</button><button className={(dayRecord?.exercises[index]?.completedSets??0)>0?"status done":"status"} onClick={()=>toggleExercise(index)}>{(dayRecord?.exercises[index]?.completedSets??0)>0?"已完成":"完成"}</button><button className="icon-button" aria-label={`编辑${exercise.name}`} onClick={()=>{setEditingExercise(index);setExerciseDraft({...exercise})}}>···</button></div><p className="exercise-meta">{exercise.target??"训练"} · {exercise.totalSets??0} 组 × {exercise.reps??"按需"}</p>{editingExercise===index&&<div className="exercise-editor"><Edit label="动作名称" value={exerciseDraft.name} onChange={(value)=>setExerciseDraft({...exerciseDraft,name:value})}/><div className="field-grid"><Edit label="部位" value={exerciseDraft.target??""} onChange={(value)=>setExerciseDraft({...exerciseDraft,target:value})}/><Edit label="组数" number value={exerciseDraft.totalSets??0} onChange={(value)=>setExerciseDraft({...exerciseDraft,totalSets:asNumber(value)??0})}/></div><Edit label="次数／时间" value={exerciseDraft.reps??""} onChange={(value)=>setExerciseDraft({...exerciseDraft,reps:value})}/><div className="actions"><button className="primary" onClick={()=>{changeTrainingDay({items:trainingDay.items.map((item,i)=>i===index?exerciseDraft:item)});setEditingExercise(null)}}>保存动作</button><button className="secondary" onClick={()=>setEditingExercise(null)}>取消</button></div></div>}</section>)}
      {trainingDay && <><button className="add-exercise" onClick={()=>{setEditingExercise(-1);setExerciseDraft({name:"",target:"",totalSets:3,reps:"12"})}}>＋ 添加动作</button>{editingExercise===-1&&<section className="card exercise-editor"><Edit label="动作名称" value={exerciseDraft.name} onChange={(value)=>setExerciseDraft({...exerciseDraft,name:value})}/><div className="field-grid"><Edit label="部位" value={exerciseDraft.target??""} onChange={(value)=>setExerciseDraft({...exerciseDraft,target:value})}/><Edit label="组数" number value={exerciseDraft.totalSets??0} onChange={(value)=>setExerciseDraft({...exerciseDraft,totalSets:asNumber(value)??0})}/></div><Edit label="次数／时间" value={exerciseDraft.reps??""} onChange={(value)=>setExerciseDraft({...exerciseDraft,reps:value})}/><button className="primary" disabled={!exerciseDraft.name.trim()} onClick={()=>{changeTrainingDay({items:[...trainingDay.items,exerciseDraft]});setEditingExercise(null)}}>保存新动作</button></section>}</>}
      <button className="primary" disabled={busy||!trainingDay} onClick={()=>changeTrainingDay({})}>保存到 {date} 的训练记录</button>
    </> : <section className="card"><h2>{date} · 自由训练</h2><p>动作保存在这一天的训练记录中，可重复保存继续修改。</p>{freeItems.map((item,index)=><div key={index}><div className="record-row"><div><strong>{String(item.name??item.exerciseName??"动作")}</strong><p className="fine">{Number(item.totalSets??item.sets??3)} 组 × {String(item.reps??"按需")}</p></div><button className="text-button" aria-label={`编辑自由训练${String(item.name??item.exerciseName??"动作")}`} onClick={()=>{setEditingExercise(index);setExerciseDraft({...item,name:String(item.name??item.exerciseName??"动作"),totalSets:Number(item.totalSets??item.sets??3),reps:String(item.reps??"按需")})}}>编辑</button><button className="secondary" disabled={busy} onClick={()=>saveFreeItems(freeItems.map((part,i)=>i===index?{...part,completedSets:Number(dayRecord?.exercises[index]?.completedSets??0)>0?0:Number(part.totalSets??part.sets??3)}:part))}>{Number(dayRecord?.exercises[index]?.completedSets??0)>0?"已完成":"完成"}</button><button className="text-danger" disabled={busy} onClick={()=>{saveFreeItems(freeItems.filter((_,i)=>i!==index));setEditingExercise(null)}}>删除</button></div>{editingExercise===index&&<div className="exercise-editor"><Edit label="动作名称" value={exerciseDraft.name} onChange={(value)=>setExerciseDraft({...exerciseDraft,name:value})}/><Edit label="组数" number value={exerciseDraft.totalSets??3} onChange={(value)=>setExerciseDraft({...exerciseDraft,totalSets:asNumber(value)??0})}/><Edit label="次数／时间" value={exerciseDraft.reps??""} onChange={(value)=>setExerciseDraft({...exerciseDraft,reps:value})}/><button className="primary" disabled={busy||!exerciseDraft.name.trim()} onClick={()=>{saveFreeItems(freeItems.map((part,i)=>i===index?{...part,...exerciseDraft}:part));setEditingExercise(null)}}>保存自由训练动作</button></div>}</div>)}<div className="actions"><input className="plain-input" value={newExercise} onChange={(event)=>setNewExercise(event.target.value)} placeholder="输入动作名称"/><button className="secondary" disabled={busy||!newExercise.trim()} onClick={()=>{saveFreeItems([...freeItems,{name:newExercise.trim(),sets:3,reps:"按需"}]);setNewExercise("")}}>添加动作</button></div><textarea rows={3} value={freeRequest} onChange={(event)=>setFreeRequest(event.target.value)} placeholder="或告诉 AI 今天想练什么、哪里不舒服"/><button className="secondary" disabled={busy||!freeRequest.trim()} onClick={generateFreePlan}>AI 制定今日计划</button><button className="primary" disabled={!freeItems.length||busy} onClick={()=>saveFreeItems(freeItems)}>保存到 {date} 的训练记录</button></section>}

  </>}
  {!loading && signedIn && page === "posture" && <><div className="posture-progress">{postureCount}/3</div><section className="card posture-reminder"><span className="icon-tile">♧</span><div><strong>每日自检提醒</strong><small>打开页面时随时可以打卡</small></div></section>{postureGuides.map((guide)=><section className="card posture-guide" key={guide.type}><div className="card-head"><h2><span className="icon-tile"><PersonStanding size={17}/></span>{guide.title}</h2><button className={data.posture.some((item)=>item.date===date&&item.type===guide.type)?"status done":"status"} disabled={data.posture.some((item)=>item.date===date&&item.type===guide.type)} onClick={()=>save({...data,posture:[...data.posture,{id:crypto.randomUUID(),date,type:guide.type,createdAt:new Date().toISOString()}]})}>✓ {data.posture.some((item)=>item.date===date&&item.type===guide.type)?"已打卡":"打卡"}</button></div>{guide.groups.map(([main,detail],index)=><div className="posture-group" key={index}><strong>{main}</strong><p>•　{detail}</p></div>)}</section>)}<p className="fine">动作以舒适为准；持续疼痛或症状加重时请寻求专业评估。</p></>}
  {!loading && signedIn && page === "stats" && <>
    <section className="card stats-overview">{[["累计训练",data.trainingRecords.filter((item)=>item.completed).length],["姿态打卡",data.posture.length],["体态拍照",data.photos.length],["饮食记录",data.meals.length]].map(([label,value])=><div key={label}><strong>{value}</strong><small>{label}</small></div>)}</section>
    <section className="card"><div className="card-head"><h2>打卡日历</h2><div className="month-nav"><button aria-label="上个月" onClick={()=>moveStatsMonth(-1)}>‹</button><strong>{statsYear}.{String(statsMonthNumber).padStart(2,"0")}</strong><button aria-label="下个月" onClick={()=>moveStatsMonth(1)}>›</button></div></div><p className="calendar-key"><b>●</b> 训练　<span>●</span> 姿态　<small>点击日期查看当天详情</small></p><div className="calendar-grid">{["日","一","二","三","四","五","六"].map((label)=><span key={label} className="week-label">{label}</span>)}{Array.from({length:statsOffset},(_,index)=><span key={`blank-${index}`}/>)}{Array.from({length:statsDays},(_,index)=>{const day=`${statsMonth}-${String(index+1).padStart(2,"0")}`;const trained=data.trainingRecords.some((item)=>item.recordDate===day&&item.completed);const checked=data.posture.some((item)=>item.date===day);return <button key={day} className={date===day?"active":""} aria-label={`${day} 详情`} onClick={()=>setDate(day)}>{index+1}<i>{trained&&<b/>}{checked&&<em/>}</i></button>})}</div><div className="calendar-detail"><strong>{date}</strong><span>训练 {data.trainingRecords.filter((item)=>item.recordDate===date&&item.completed).length} 次 · 姿态 {data.posture.filter((item)=>item.date===date).length} 次 · 饮食 {meals.length} 餐</span></div></section>
    <section className="card" aria-label="当天记录详情"><h2>{date} 的记录</h2><h3>当天训练 · {records.length} 条</h3>{records.length?records.map((record)=><article className="selected-training-record" key={record.id}><strong>{record.theme} · {record.completed?"已完成":"未完成"}</strong><p className="fine">{record.mode==="light"?"轻度训练":record.mode==="free"?"自由训练":"正常训练"}{record.warmupCompleted?" · 已完成热身":""}{record.durationMinutes?` · ${record.durationMinutes} 分钟`:""}</p><ul>{record.exercises.map((exercise,index)=><li key={index}><strong>{exercise.name}</strong><span>　{exercise.completedSets??0}/{exercise.totalSets??"—"} 组{exercise.reps?` × ${exercise.reps}`:""}</span>{exercise.notes&&<p className="fine">{exercise.notes}</p>}</li>)}</ul>{record.painNotes&&<p>身体反馈：{record.painNotes}</p>}{record.freeNotes&&<p>训练备注：{record.freeNotes}</p>}</article>):<p className="empty">这一天没有训练记录。</p>}<h3>当天饮食 · {meals.length} 餐</h3>{meals.length?meals.map((meal)=><MealView key={meal.id} meal={meal}/>):<p className="empty">这一天没有饮食记录。</p>}<div className="actions"><button className="secondary" onClick={()=>{setRecordTab("food");setPage("records")}}>查看 / 编辑当天饮食</button>{records.length>0&&<button className="secondary" onClick={()=>{setMode(records[0].mode==="light"?"light":records[0].mode==="free"?"free":"normal");setPage("training")}}>查看当天训练</button>}</div></section>
    <section className="card"><h2>近4周训练完成</h2><p className="fine">每周最多 6 个训练日</p><div className="mini-bars">{Array.from({length:4},(_,index)=>{const start=new Date(`${nowDate()}T12:00:00+08:00`);start.setUTCDate(start.getUTCDate()-((3-index)*7+6));const end=new Date(start);end.setUTCDate(end.getUTCDate()+6);const count=data.trainingRecords.filter((item)=>item.completed&&new Date(`${item.recordDate}T12:00:00+08:00`)>=start&&new Date(`${item.recordDate}T12:00:00+08:00`)<=end).length;return <div key={index}><span style={{height:`${Math.max(8,Math.min(100,count/6*100))}%`}}/><small>{count}天</small></div>})}</div></section>
    <section className="card"><h2>近7天姿态打卡</h2><p>{data.posture.filter((item)=>new Date(`${item.date}T12:00:00+08:00`)>=new Date(Date.now()-7*86400000)).length} 次</p></section>
    <section className="card"><h2>近期饮食记录</h2>{[...data.meals].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map((meal)=><MealView key={meal.id} meal={meal}/>)}</section>
    <section className="card"><h2>体态周记录</h2><p>已保存 {data.photos.length} 组体态记录；腰围至少记录 2 次后可比较变化。</p></section>
  </>}
  {!loading && signedIn && page === "records" && <>
    {externalDiet&&<p className="callout">饮食在「{shortPlan.dietApp}」记录。下方保留本软件的历史数据，未自动同步该 App。</p>}
    <div className="record-tabs"><button className={recordTab==="posture"?"active":""} onClick={()=>setRecordTab("posture")}>体态拍照</button><button className={recordTab==="food"?"active":""} onClick={()=>setRecordTab("food")}>{externalDiet?"饮食历史":"饮食记录"}</button></div>
    {recordTab === "posture" ? <><section className="card"><div className="card-head"><h2>本周体态照</h2><span className="date-badge">{weekDates[0].slice(5).replace("-",".")} – {weekDates[6].slice(5).replace("-",".")}</span></div><p className="fine">一周拍一次：固定星期、同一时间位置光线，自然站立。</p><div className="photo-sides">{(["front","side","back"] as const).map((side)=><label key={side}><span>{({front:"正面",side:"侧面",back:"背面"})[side]}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>setPostureFiles({...postureFiles,[side]:event.target.files?.[0]??null})}/><small>{postureFiles[side]?.name??"拍照 / 相册"}</small></label>)}</div><Edit label="腰围 cm（可选）" number value={waistCm} onChange={setWaistCm}/><p className="fine">每周日量一次，至少 2 次才出趋势。</p><label className="field">本次备注（可选）<textarea rows={3} value={postureNote} onChange={(event)=>setPostureNote(event.target.value)}/></label><button className="primary" disabled={busy||(!Object.values(postureFiles).some(Boolean)&&!waistCm.trim())} onClick={savePosturePhotos}>保存本周体态</button></section><section className="card"><h3>历史周照</h3><p className="fine">共 {data.photos.length} 组</p>{data.photos.map((item,index)=><div className="record-row" key={String(item.id??index)}><strong>{String(item.date??item.weekStart??"未标日期")}</strong><span>腰围 {String(item.waistCm??"未记录")} cm</span><div className="saved-photos">{["frontKey","sideKey","backKey"].filter((key)=>typeof item[key]==="string").map((key)=><PrivatePhoto key={key} photoKey={String(item[key])} alt="体态照片"/>)}</div></div>)}</section></> : <><section className="card record-date-card"><div className="card-head"><h2>饮食记录</h2><span className="date-badge">已记 {meals.length} 餐</span></div><label>▣　记录日期： <input type="date" value={date} onChange={(event)=>setDate(event.target.value)}/></label></section>{externalDiet?(meals.length?<section className="card">{meals.map((meal)=><MealView key={meal.id} meal={meal}/>)}</section>:<section className="card"><p>本软件没有这一天的饮食记录，请在「{shortPlan.dietApp}」查看。</p></section>):(["breakfast","lunch","dinner","snack"] as const).map((type)=><MealSlot key={`${date}-${type}`} type={type} meal={meals.find((meal)=>meal.type===type)} busy={busy} onSave={(text,file,existing)=>saveInlineMeal(type,text,file,existing)} onDelete={(meal)=>save({...data,meals:data.meals.filter((item)=>item.id!==meal.id)})} onAdvanced={(meal)=>beginMeal(type,meal)}/>)}<section className="card"><div className="card-head"><h3>历史记录</h3><span className="date-badge">共 {data.meals.length} 条</span></div><button className="text-button" onClick={()=>setShowHistory(!showHistory)}>{showHistory?"收起":"按日期查看"}　⌄</button>{showHistory&&Array.from(new Set(data.meals.map((meal)=>meal.date))).sort().reverse().map((day)=><details key={day} className="history-day"><summary>{day} <small>{data.meals.filter((meal)=>meal.date===day).length} 餐</small></summary>{data.meals.filter((meal)=>meal.date===day).map((meal)=><MealView meal={meal} key={meal.id}/>)}</details>)}</section></>}
  </>}
  {!loading && signedIn && page === "coach" && <>
    <section className="card coach-permission"><strong>♢　开启后 AI 能参考你的记录</strong><p>教练会结合周计划、训练、疼痛备注和饮食记录回答；具体建议由你决定。</p></section>
    <section className="card coach-welcome"><div className="coach-sparkle"><Sparkles size={28}/></div><h2>你的专属教练已就位</h2><p>动作能不能做、肩痛要不要停、骨盆怎么调、饮食怎么吃，直接问</p><div className="coach-chips">{["今天肩峰有点刺痛，还能练吗？","结合我这周的计划，今天该重点练什么？","我最近训练完成得怎么样，给我点动力","减脂期晚餐怎么吃，不饿肚子？"].map((question)=><button key={question} onClick={()=>setCoachQuestion(question)}>{question}</button>)}</div></section>
    {coachAnswer&&<section className="card coach-answer"><h3>教练回复</h3><p>{coachAnswer}</p></section>}
    <details className="card coach-history"><summary>历史对话 · {data.coachMessages.length} 条</summary>{data.coachMessages.map((entry,index)=><div className="chat" key={String(entry.id??index)}><small>{entry.role==="user"?"你":"教练"}</small><p>{String(entry.content??"")}</p></div>)}</details>
    <div className="coach-composer"><input value={coachQuestion} onChange={(event)=>setCoachQuestion(event.target.value)} placeholder="问教练：动作、疼痛、体态、饮食…"/><button disabled={busy||!coachQuestion.trim()} onClick={async()=>{setBusy(true);try{const response=await apiFetch("/api/coach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:coachQuestion,context:{profile:data.profile,recentMeals:data.meals.slice(0,12),recentTraining:data.trainingRecords.slice(0,8)}})});const result=await readJson(response);if(!response.ok)throw new Error(result.error);setCoachAnswer(result.answer);await save({...data,coachMessages:[...data.coachMessages,{id:crypto.randomUUID(),role:"user",content:coachQuestion,createdAt:new Date().toISOString()},{id:crypto.randomUUID(),role:"assistant",content:result.answer,createdAt:new Date().toISOString()}]});setCoachQuestion("")}catch(error){setNotice(error instanceof Error?error.message:"教练暂不可用")}finally{setBusy(false)}}}>➤</button></div>
    <p className="fine coach-caution">建议供参考；持续疼痛、肾病或影响血钾的药物请咨询医生。</p>
  </>}
  {!loading && signedIn && page === "settings" && <div className="columns"><section className="card"><h2>账号与登录</h2><p>设置简练密码后，可直接打开网址，用邮箱和密码登录。</p><a className="primary" href="?account=password">设置或修改登录密码</a></section><section className="card"><span className="eyebrow">PERSONAL TARGETS</span><h2>你的参考范围</h2><p className="fine">热量和碳水范围由你填写；系统不会根据照片自动设定减脂目标。</p><div className="field-grid"><Edit label="体重 kg" number value={data.profile.weightKg??""} onChange={(value)=>setData({...data,profile:{...data.profile,weightKg:asNumber(value)??undefined}})}/><Edit label="日能量 kcal" number value={data.profile.calorieTarget??""} onChange={(value)=>setData({...data,profile:{...data.profile,calorieTarget:asNumber(value)??undefined}})}/><Edit label="碳水下限 g" number value={data.profile.carbMin??""} onChange={(value)=>setData({...data,profile:{...data.profile,carbMin:asNumber(value)??undefined}})}/><Edit label="碳水上限 g" number value={data.profile.carbMax??""} onChange={(value)=>setData({...data,profile:{...data.profile,carbMax:asNumber(value)??undefined}})}/><Edit label="钠参考上限 mg" number value={data.profile.sodiumMax} onChange={(value)=>setData({...data,profile:{...data.profile,sodiumMax:asNumber(value)??2000}})}/></div><label className="checkline"><input type="checkbox" checked={data.profile.avoidBanana} onChange={(event)=>setData({...data,profile:{...data.profile,avoidBanana:event.target.checked}})}/> 推荐中避开香蕉</label><label className="checkline"><input type="checkbox" checked={data.profile.kidneyCaution} onChange={(event)=>setData({...data,profile:{...data.profile,kidneyCaution:event.target.checked}})}/> 有肾病或影响血钾的用药</label><button className="primary" disabled={busy} onClick={()=>save(data)}>保存设置</button></section><section className="card"><span className="eyebrow">MIGRATION</span><h2>数据备份与导入</h2><p>保留原日期、训练完成状态、饮食描述、照片和教练对话。</p><button className="secondary" onClick={()=>{setBusy(true);downloadBackup(data).catch(()=>setNotice("备份失败，请确认照片能正常读取后重试")).finally(()=>setBusy(false));}} disabled={busy}>下载当前记录备份</button><label className="upload small"><input type="file" accept=".json,application/json" onChange={(event)=>{const file=event.target.files?.[0];if(file)importData(file)}}/><Plus size={20}/> 选择迁移备份 JSON</label><details><summary>粘贴迁移备份</summary><textarea rows={4} value={importText} onChange={(event)=>setImportText(event.target.value)} placeholder="粘贴 JSON 备份"/><button className="secondary" disabled={busy||!importText.trim()} onClick={()=>importData(importText)}>导入粘贴内容</button></details><p className="fine">当前已有 {data.meals.length} 条饮食、{data.trainingRecords.length} 条训练。导入会替换当前数据。</p><hr/><h3>营养参考</h3><a href="https://www.who.int/news/item/31-01-2013-who-issues-new-guidance-on-dietary-salt-and-potassium" target="_blank" rel="noreferrer">WHO：钠与钾摄入 ↗</a><a href="https://www.heart.org/en/health-topics/high-blood-pressure/changes-you-can-make-to-manage-high-blood-pressure/how-potassium-can-help-control-high-blood-pressure/" target="_blank" rel="noreferrer">美国心脏协会：钾与血压 ↗</a><a href="https://pubmed.ncbi.nlm.nih.gov/42867412/" target="_blank" rel="noreferrer">运动营养学会：减重期蛋白质 ↗</a></section></div>}
  </main><footer>简练 · 让记录帮助你调整，而不是让数字替你做决定。</footer></div><nav className="bottom-nav" aria-label="移动导航">{nav.map(({id,label,icon:Icon})=><button key={id} className={(page===id || (page==="food"&&id==="records"))?"active":""} onClick={()=>setPage(id)}><Icon size={18}/><span>{label}</span></button>)}</nav></div>;
}

function Edit({label,value,onChange,number=false}:{label:string;value:string|number;onChange:(value:string)=>void;number?:boolean}) { return <label className="field"><span>{label}</span><input type={number?"number":"text"} min={number?0:undefined} step={number?"any":undefined} value={value} onChange={(event)=>onChange(event.target.value)}/></label>; }
function MealView({meal,onDelete}:{meal:Meal;onDelete?:()=>void}) { const nutrients=mealTotals(meal); const image=photoUrl(meal); return <div className="meal-view">{meal.photoKey ? <PrivatePhoto photoKey={meal.photoKey} alt="餐食照片"/> : image && <img src={image} alt="餐食照片"/>}<div><small>{meal.date} · {mealNames[meal.type]??meal.type}</small><strong>{meal.description||meal.foods.map((item)=>item.name).join("、")||"餐食照片"}</strong><span>{display(nutrients.kcal,"kcal")} · 蛋白 {display(nutrients.protein,"g")} · 钠 {display(nutrients.sodium,"mg")}</span>{meal.foods.length>0 && <em>估算已核对 {meal.foods.length} 项</em>}</div>{onDelete && <button className="text-danger" onClick={onDelete}>删除</button>}</div>; }
function MealSlot({type,meal,busy,onSave,onDelete,onAdvanced}:{type:string;meal?:Meal;busy:boolean;onSave:(text:string,file:File|null,existing?:Meal)=>void;onDelete:(meal:Meal)=>void;onAdvanced:(meal?:Meal)=>void}) {
  const [text,setText] = useState(meal?.description ?? "");
  const [file,setFile] = useState<File|null>(null);
  const [preview,setPreview] = useState("");
  useEffect(()=>{setText(meal?.description??"")},[meal?.id,meal?.description]);
  useEffect(()=>{if(!file){setPreview("");return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file]);
  const image=meal ? photoUrl(meal):"";
  const nutrients=meal?mealTotals(meal):null;
  const time=({breakfast:"08:00",lunch:"12:30",dinner:"18:30",snack:"15:00"} as Record<string,string>)[type];
  return <section className="card meal-slot"><div className="card-head"><h3>{mealNames[type]} <small>{time}</small></h3>{meal&&<button className="text-danger" onClick={()=>onDelete(meal)}>▤ 删除</button>}</div><div className="meal-inline"><label className="meal-photo"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>setFile(event.target.files?.[0]??null)}/>{preview?<img src={preview} alt="餐食照片"/>:meal?.photoKey?<PrivatePhoto photoKey={meal.photoKey} alt="餐食照片"/>:image?<img src={image} alt="餐食照片"/>:<><Camera size={20}/><span>上传图片</span></>}</label><textarea rows={3} value={text} onChange={(event)=>setText(event.target.value)} placeholder="记录这一餐吃了什么"/></div>{nutrients&&<p className="meal-nutrients">{display(nutrients.kcal,"kcal")} · 蛋白 {display(nutrients.protein,"g")} · 钠 {display(nutrients.sodium,"mg")}</p>}<div className="meal-slot-actions"><button className="text-button" onClick={()=>onAdvanced(meal)}>识别营养 / 编辑克数</button><button className="primary" disabled={busy||(!text.trim()&&!file&&!meal)} onClick={()=>{onSave(text,file,meal);setFile(null)}}>{meal&&text===meal.description&&!file?"已保存":"保存"}</button></div></section>;
}
