export type Nutrients = { kcal: number | null; protein: number | null; carbs: number | null; sodium: number | null; potassium: number | null };
export type Food = { id: string; name: string; grams: number | null; nutrients: Nutrients; confidence: "低" | "中" | "高"; note?: string };
export type Meal = { id: string; date: string; type: string; description: string; foods: Food[]; legacyCalories: number | null; legacyProtein: number | null; photoKey?: string; photoUrl?: string; createdAt?: string };
export type Exercise = { name: string; reps?: string; target?: string; totalSets?: number; completedSets?: number; notes?: string; shoulderLoad?: number; [key: string]: unknown };
export type TrainingRecord = { id: string; recordDate: string; mode: string; theme: string; completed: boolean; exercises: Exercise[]; painNotes?: string | null; freeNotes?: string | null; durationMinutes?: number | null; [key: string]: unknown };
export type Plan = { mode: string; days: Array<{ dayOfWeek: number; theme: string; items: Exercise[]; isRest?: boolean; [key: string]: unknown }> };
export type FreePlan = { id: string; planDate: string; items: Array<Record<string, unknown>>; source: string; userInput?: string | null; createdAt?: string };
export type Profile = { nickname?: string; trainingMode?: string; weightKg?: number; calorieTarget?: number; carbMin?: number; carbMax?: number; sodiumMax: number; avoidBanana: boolean; kidneyCaution: boolean };
export type ShortPlan = { title: string; goal: string; content: string; calorieDeficit: number; dietApp: string };
export const defaultShortPlan: ShortPlan = { title: "减脂与核心训练", goal: "以减脂为主，改善骨盆前倾，加强核心与腹横肌力量，其余训练以保住肌肉为主。", content: "重点练习核心与腹横肌，多做腹式呼吸；保留力量训练，以保肌为目标。", calorieDeficit: 600, dietApp: "吃有数" };
export type FitnessData = { meals: Meal[]; trainingRecords: TrainingRecord[]; plans: { normal: Plan | null; light: Plan | null }; warmup: Array<Record<string, unknown>>; freePlans: FreePlan[]; coachMessages: Array<Record<string, unknown>>; posture: Array<Record<string, unknown>>; metrics: Array<Record<string, unknown>>; photos: Array<Record<string, unknown>>; profile: Profile; completedDates: string[]; shortPlan?: ShortPlan; actualPlanDays?: Record<string,number>; importedAt?: string };

export const emptyData: FitnessData = {
  meals: [], trainingRecords: [], plans: { normal: null, light: null }, warmup: [], freePlans: [], coachMessages: [], posture: [], metrics: [], photos: [],
  profile: { sodiumMax: 2000, avoidBanana: true, kidneyCaution: false }, completedDates: [], actualPlanDays: {},
};

export function saveDailyTraining(data: FitnessData, date: string, mode: string, theme: string, items: Exercise[], planDayOfWeek?: number): FitnessData {
  const existing = data.trainingRecords.find((record) => record.recordDate === date && record.mode === mode);
  const exercises = items.map((item) => ({ ...item, completedSets: item.completedSets ?? existing?.exercises.find((previous) => previous.name === item.name)?.completedSets ?? 0 }));
  const record: TrainingRecord = { ...existing, id: existing?.id ?? crypto.randomUUID(), recordDate: date, mode, theme, exercises, completed: exercises.length > 0 && exercises.every((item) => Number(item.totalSets) > 0 && item.completedSets >= Number(item.totalSets)), ...(planDayOfWeek === undefined ? {} : { planDayOfWeek }) };
  return { ...data, trainingRecords: existing ? data.trainingRecords.map((item) => item.id === existing.id ? record : item) : [record, ...data.trainingRecords] };
}

export function fromOriginal(raw: Record<string, unknown>, lightPlan?: Plan | null): FitnessData {
  const legacyMeals = ((raw.meals as { items?: Array<Record<string, unknown>> })?.items ?? []);
  const meals: Meal[] = legacyMeals.map((meal) => ({
    id: String(meal.id), date: String(meal.mealDate), type: String(meal.mealType), description: String(meal.foodItems ?? ""), foods: [],
    legacyCalories: typeof meal.calories === "number" ? meal.calories : null,
    legacyProtein: typeof meal.proteinGrams === "number" ? meal.proteinGrams : null,
    photoUrl: typeof meal.photoUrl === "string" ? meal.photoUrl : undefined,
  }));
  const trainingRecords = ((raw.trainingRecords as { items?: TrainingRecord[] })?.items ?? []);
  const plan = raw.trainingPlan as Plan | undefined;
  const normalizePlan = (value?: Plan | null): Plan | null => value ? { ...value, days: value.days.map((day) => ({ ...day, items: day.items.map((item) => ({ ...item, name: String(item.name ?? item.exerciseName ?? "动作"), target: String(item.target ?? item.exerciseTarget ?? "训练"), totalSets: Number(item.totalSets ?? item.sets ?? 0), reps: String(item.reps ?? "按需") })) })) } : null;
  const freePlan = raw.freePlan as FreePlan | undefined;
  return {
    ...emptyData,
    profile: { ...emptyData.profile, ...(raw.profile as Partial<Profile> | undefined) },
    meals,
    trainingRecords,
    plans: { normal: normalizePlan(plan?.mode === "normal" ? plan : null), light: normalizePlan(lightPlan ?? (plan?.mode === "light" ? plan : null)) },
    warmup: Array.isArray(raw.warmup) ? raw.warmup : [],
    freePlans: freePlan?.id ? [freePlan] : [],
    coachMessages: Array.isArray(raw.coachMessages) ? raw.coachMessages : [],
    posture: Array.isArray(raw.posture) ? raw.posture : [],
    metrics: Array.isArray(raw.metrics) ? raw.metrics : [],
    photos: ((raw.photos as { items?: Array<Record<string, unknown>> })?.items ?? []),
    importedAt: new Date().toISOString(),
  };
}

export function readBackup(raw: unknown): FitnessData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("备份格式不正确");
  const value = raw as Record<string, unknown>;
  if (value.meals && !Array.isArray(value.meals) && Array.isArray((value.meals as { items?: unknown }).items) && Array.isArray((value.trainingRecords as { items?: unknown } | undefined)?.items)) {
    return fromOriginal(value, value.lightPlan as Plan | undefined);
  }
  const arrays = ["meals", "trainingRecords", "warmup", "freePlans", "coachMessages", "posture", "metrics", "photos", "completedDates"];
  if (!arrays.every((key) => Array.isArray(value[key])) || !value.plans || typeof value.plans !== "object" || !value.profile || typeof value.profile !== "object") throw new Error("备份格式不正确");
  return { ...emptyData, ...value, profile: { ...emptyData.profile, ...value.profile } } as FitnessData;
}

export function mealTotals(meal: Meal): Nutrients {
  if (!meal.foods.length) return { kcal: meal.legacyCalories, protein: meal.legacyProtein, carbs: null, sodium: null, potassium: null };
  const keys: Array<keyof Nutrients> = ["kcal", "protein", "carbs", "sodium", "potassium"];
  return Object.fromEntries(keys.map((key) => [key, meal.foods.every((food) => food.nutrients[key] !== null) ? meal.foods.reduce((sum, food) => sum + (food.nutrients[key] ?? 0), 0) : null])) as Nutrients;
}

export function dayTotals(meals: Meal[]): { totals: Nutrients; incomplete: number } {
  const totals = meals.map(mealTotals);
  const keys: Array<keyof Nutrients> = ["kcal", "protein", "carbs", "sodium", "potassium"];
  const result = Object.fromEntries(keys.map((key) => [key, totals.some((total) => total[key] !== null) ? totals.reduce((sum, total) => sum + (total[key] ?? 0), 0) : null])) as Nutrients;
  return { totals: result, incomplete: totals.filter((total) => keys.some((key) => total[key] === null)).length };
}

export function foodAlerts(data: FitnessData, date: string): string[] {
  const dietApp = (data.shortPlan ?? defaultShortPlan).dietApp.trim();
  if (dietApp) return [`饮食在「${dietApp}」记录。本软件未连接该 App，无法据此判断当天的营养摄入。`];
  const meals = data.meals.filter((meal) => meal.date === date);
  if (!meals.length) return ["今天还没有饮食记录，可以从拍照或手动记录开始。"];
  const { totals, incomplete } = dayTotals(meals);
  const alerts: string[] = [];
  if (incomplete) alerts.push(`${incomplete} 餐营养信息不完整；已显示的数值是已知摄入，不代表全天总量。`);
  if (meals.some((meal) => /高钠|490\s*mg/i.test(meal.description)) && totals.sodium === null) alerts.push("你记录了高钠面包。先核对包装上的 490mg 是每袋还是合计，再判断当天的钠摄入。接下来优先选少盐外卖，不用刻意连续几天大量补钾。");
  if (totals.sodium !== null && totals.sodium > data.profile.sodiumMax) alerts.push("已记录的钠超过设置上限。接下来的餐食优先少盐、少酱，并查看包装标签；无需按天数用钾来“抵消”。");
  const proteinMin = data.profile.weightKg ? Math.round(data.profile.weightKg * 1.2) : null;
  if (data.completedDates.includes(date) && proteinMin && meals.every((meal) => mealTotals(meal).protein !== null) && totals.protein !== null && totals.protein < proteinMin) alerts.push(`蛋白质低于你按体重设置的参考下限 ${proteinMin}g，可考虑下一餐增加鸡蛋、豆腐、鱼或去皮鸡肉。`);
  if (data.completedDates.includes(date) && meals.every((meal) => mealTotals(meal).carbs !== null) && totals.carbs !== null) {
    if (data.profile.carbMin && totals.carbs < data.profile.carbMin) alerts.push("碳水低于你设定的下限，可用适量红薯、土豆或米饭补足。");
    if (data.profile.carbMax && totals.carbs > data.profile.carbMax) alerts.push("碳水超过你设定的上限；先核对份量，下餐按饥饿感和总能量调整。");
  }
  return alerts;
}
