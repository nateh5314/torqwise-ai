import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { ActivityIndicator, Alert, Linking, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type Tab = "Home" | "Diagnose" | "VIN" | "Tools" | "Research" | "Garage";
type ResearchSource = { title?: string; url?: string };
type Dtc = { title: string; meaning: string; steps: string; causes?: string[]; symptoms?: string[]; sources?: string[] };
type SavedCase = { id: string; code: string; title: string; meaning: string; notes?: string; savedAt: string };
type DtcRecord = {
  code: string;
  title?: { en?: string };
  description?: { en?: string };
  common_causes?: { label?: { en?: string } }[];
  symptoms?: { en?: string }[];
  affected_components?: string[];
  sources?: string[];
};
const WEB = "https://torqwiseauto.netlify.app/";
const CODES: Record<string, Dtc> = {
  P0300: { title: "Random / multiple-cylinder misfire", meaning: "The engine computer detected misfires on multiple cylinders or could not isolate one cylinder.", steps: "Review freeze-frame data and misfire counters. Inspect ignition, fuel delivery, intake leaks, and mechanical condition before replacing parts." },
  P0171: { title: "System too lean — Bank 1", meaning: "The control module is correcting for a lean air/fuel condition on Bank 1.", steps: "Check intake and vacuum leaks, MAF data, fuel trims, purge operation, and fuel pressure using vehicle-specific service information." },
  P0420: { title: "Catalyst efficiency below threshold — Bank 1", meaning: "Catalyst-monitor results fell below the calibrated threshold. This code alone does not prove the catalyst has failed.", steps: "Check exhaust leaks, misfires, fuel-control issues, sensor data, and monitor conditions before condemning the catalyst." },
  P0301: { title: "Cylinder 1 misfire", meaning: "The engine computer detected a misfire associated with cylinder 1.", steps: "Confirm cylinder numbering for the exact engine. Review misfire counters and test ignition, injector, compression, and wiring as appropriate." },
  P0128: { title: "Coolant temperature below regulating temperature", meaning: "The engine did not reach expected coolant temperature within monitor conditions.", steps: "Verify coolant level and sensor plausibility, warm-up behavior, thermostat operation, and relevant OEM bulletins." },
  P0442: { title: "EVAP system small leak", meaning: "The evaporative-emissions monitor detected a leak-sized condition.", steps: "Inspect the fuel cap and EVAP hoses, then follow the OEM-approved leak-test procedure." }
};
const TABS: { label: Tab; icon: string }[] = [
  { label: "Home", icon: "⌂" }, { label: "Diagnose", icon: "⌁" }, { label: "VIN", icon: "▤" }, { label: "Tools", icon: "⚒" }, { label: "Research", icon: "⌕" }, { label: "Garage", icon: "▣" }
];

export default function App() {
  const [tab, setTab] = useState<Tab>("Home");
  const [code, setCode] = useState("P0300");
  const [vin, setVin] = useState("");
  const [vinResult, setVinResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [vehicle, setVehicle] = useState("");
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [garageLoaded, setGarageLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [bundledDtc, setBundledDtc] = useState<Record<string, Dtc>>({});
  const [databaseReady, setDatabaseReady] = useState(false);
  const [databaseCount, setDatabaseCount] = useState(0);
  const [databaseRetry, setDatabaseRetry] = useState(0);
  const [databaseSyncTime, setDatabaseSyncTime] = useState<string | null>(null);
  const [databaseLoadError, setDatabaseLoadError] = useState("");
  const [savedCases, setSavedCases] = useState<SavedCase[]>([]);
  const [caseNotes, setCaseNotes] = useState("");
  const [casesLoaded, setCasesLoaded] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [toolVehicle, setToolVehicle] = useState("");
  const [toolRequest, setToolRequest] = useState("");
  const [toolRegion, setToolRegion] = useState("Canada");
  const [researchAsset, setResearchAsset] = useState("");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [researchTopic, setResearchTopic] = useState("diagnostic");
  const [researchAnswer, setResearchAnswer] = useState("");
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([]);
  const [researchRemaining, setResearchRemaining] = useState<number | null>(null);
  const [researchIsPro, setResearchIsPro] = useState<boolean | null>(null);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState("");

  useEffect(() => {
    let mounted = true;
    let authSubscription: { unsubscribe: () => void } | undefined;
    const initializeAuth = async () => {
      try {
        const response = await fetch(WEB + ".netlify/functions/public-config");
        if (!response.ok) throw new Error("Account configuration is not available.");
        const config = await response.json();
        const url = typeof config?.url === "string" ? config.url.trim() : "";
        const anonKey = typeof config?.anonKey === "string" ? config.anonKey.trim() : "";
        if (!config?.configured || !/^https:\/\//i.test(url) || !anonKey) {
          throw new Error("Native sign-in is not configured on the current website deployment.");
        }
        const client = createClient(url, anonKey, {
          auth: {
            storage: {
              getItem: (key) => SecureStore.getItemAsync(key),
              setItem: (key, value) => SecureStore.setItemAsync(key, value),
              removeItem: (key) => SecureStore.deleteItemAsync(key)
            },
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false
          }
        });
        if (!mounted) return;
        setSupabase(client);
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (mounted) setSession(data.session);
        const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
          if (mounted) setSession(nextSession);
        });
        authSubscription = listener.subscription;
      } catch (cause) {
        if (mounted) setAuthMessage(cause instanceof Error ? cause.message : "Account service could not be reached.");
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };
    void initializeAuth();
    return () => {
      mounted = false;
      authSubscription?.unsubscribe();
    };
  }, []);

  async function submitAuth() {
    if (!supabase) {
      setAuthMessage("Account service is not ready yet. Try again shortly.");
      return;
    }
    const email = authEmail.trim().toLowerCase();
    if (!email || !authPassword) {
      setAuthMessage("Enter your email and password.");
      return;
    }
    if (authPassword.length < 8) {
      setAuthMessage("Use a password with at least 8 characters.");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password: authPassword });
        if (error) throw error;
        setAuthPassword("");
        setAuthMessage(data.session
          ? "Account created and signed in."
          : "Account created. Check your email to confirm it, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: authPassword });
        if (error) throw error;
        setAuthPassword("");
        setAuthMessage("Signed in successfully.");
      }
    } catch (cause) {
      setAuthMessage(cause instanceof Error ? cause.message : "Sign-in failed. Check your details and try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitResearch() {
    if (!session || !supabase) {
      setResearchError("Sign in with your TORQWISE account before running AI research.");
      setTab("Home");
      return;
    }
    if (!researchQuestion.trim() && !researchAsset.trim()) {
      setResearchError("Enter a vehicle or equipment description, or a research question.");
      return;
    }
    setResearchBusy(true);
    setResearchError("");
    setResearchAnswer("");
    setResearchSources([]);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session has expired. Sign in again.");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      let response: Response;
      try {
        response = await fetch(WEB + ".netlify/functions/research", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + token },
          body: JSON.stringify({ asset: researchAsset.trim().slice(0, 300), question: researchQuestion.trim().slice(0, 6000), topic: researchTopic }),
          signal: controller.signal
        });
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") {
          throw new Error("Research took longer than 60 seconds. Try a more focused question and run it again.");
        }
        throw new Error("Could not reach TORQWISE research. Check your connection and try again.");
      } finally {
        clearTimeout(timeout);
      }
      let payload: any;
      try {
        payload = await response.json();
      } catch {
        throw new Error("The research service returned an unreadable response. Please try again.");
      }
      if (typeof payload?.isPro === "boolean") setResearchIsPro(payload.isPro);
      if (typeof payload?.remaining === "number") setResearchRemaining(payload.remaining);
      if (!response.ok) {
        if (response.status === 402) setResearchIsPro(false);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Research could not be completed. Try again.");
      }
      if (typeof payload?.answer !== "string" || !payload.answer.trim()) throw new Error("The research service returned an empty report.");
      setResearchAnswer(payload.answer);
      setResearchSources(Array.isArray(payload.sources) ? payload.sources.filter((item: unknown): item is ResearchSource =>
        !!item && typeof item === "object" && typeof (item as ResearchSource).url === "string" && (item as ResearchSource).url!.startsWith("https://")
      ).slice(0, 12) : []);
      setResearchRemaining(typeof payload.remaining === "number" ? payload.remaining : null);
      setResearchIsPro(typeof payload.isPro === "boolean" ? payload.isPro : false);
    } catch (cause) {
      setResearchError(cause instanceof Error ? cause.message : "Research failed. Check your connection and try again.");
    } finally {
      setResearchBusy(false);
    }
  }

  function clearLocalData() {
    Alert.alert(
      "Clear local TORQWISE data?",
      "This removes vehicles in My Garage and saved diagnostic cases from this device. It does not delete your online account or affect your AI research allowance.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear local data",
          style: "destructive",
          onPress: () => {
            setVehicles([]);
            setSavedCases([]);
            void Promise.all([
              AsyncStorage.removeItem("@torqwise/garage/v1"),
              AsyncStorage.removeItem("@torqwise/diagnostic-cases/v1")
            ]).then(() => setNotice("Local garage and diagnostic history cleared from this device."))
              .catch(() => setNotice("The local data clear could not be confirmed. Please retry."));
          }
        }
      ]
    );
  }

  async function openToolSearch(kind: "shopping" | "oem" | "recall" | "service") {
    const subject = [toolVehicle.trim(), toolRequest.trim()].filter(Boolean).join(" ");
    if (!subject) {
      setNotice("Enter a vehicle or equipment and what you need to find.");
      return;
    }
    const query = [subject, kind === "shopping" ? "parts price comparison" : kind === "oem" ? "OEM parts catalog part number" : kind === "recall" ? "official recall technical service bulletin" : "official service specifications repair procedure wiring diagram", toolRegion.trim()].filter(Boolean).join(" ");
    const url = kind === "shopping"
      ? "https://www.google.com/search?tbm=shop&q=" + encodeURIComponent(query)
      : "https://www.google.com/search?q=" + encodeURIComponent(query);
    try {
      await Linking.openURL(url);
    } catch {
      setNotice("Could not open the search. Check your connection and try again.");
    }
  }

  function sendToolToResearch(topic: string, instruction: string) {
    if (!toolVehicle.trim() && !toolRequest.trim()) {
      setNotice("Enter vehicle/equipment details and what you need help with first.");
      return;
    }
    setResearchAsset(toolVehicle.trim());
    setResearchTopic(topic);
    setResearchQuestion([instruction, toolRequest.trim(), toolRegion.trim() ? "Region: " + toolRegion.trim() : ""].filter(Boolean).join("\n"));
    setResearchError("");
    setResearchAnswer("");
    setResearchSources([]);
    setTab("Research");
    setNotice("Your request is ready in AI Research. Review it, add details, and run the report.");
  }

  async function signOut() {
    if (!supabase) return;
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setAuthMessage("You have been signed out.");
    } catch (cause) {
      setAuthMessage(cause instanceof Error ? cause.message : "Sign-out failed. Try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    const normalizeDatabase = (rows: unknown): Record<string, Dtc> => {
      if (!Array.isArray(rows)) return {};
      const normalized: Record<string, Dtc> = {};
      for (const raw of rows as DtcRecord[]) {
        const key = typeof raw?.code === "string" ? raw.code.toUpperCase() : "";
        const title = raw?.title?.en;
        const meaning = raw?.description?.en;
        if (!/^[PBCU][0-9A-F]{4}$/.test(key) || typeof title !== "string" || typeof meaning !== "string") continue;
        const causes = Array.isArray(raw.common_causes)
          ? raw.common_causes.map((item) => item?.label?.en).filter((item): item is string => typeof item === "string" && !!item.trim()).slice(0, 6)
          : [];
        const symptoms = Array.isArray(raw.symptoms)
          ? raw.symptoms.map((item) => item?.en).filter((item): item is string => typeof item === "string" && !!item.trim()).slice(0, 6)
          : [];
        normalized[key] = {
          title,
          meaning,
          steps: "Use vehicle-specific service information and confirm the fault with testing before replacing parts.",
          causes,
          symptoms,
          sources: Array.isArray(raw.sources) ? raw.sources.filter((item): item is string => typeof item === "string" && item.startsWith("https://")).slice(0, 5) : []
        };
      }
      return normalized;
    };
    const loadDatabase = async () => {
      if (mounted) setDatabaseLoadError("");
      try {
        const cached = await AsyncStorage.getItem("@torqwise/dtc-database/v1");
        if (cached) {
          const parsed = normalizeDatabase(JSON.parse(cached));
          if (mounted && Object.keys(parsed).length > 0) {
            setBundledDtc(parsed);
            setDatabaseCount(Object.keys(parsed).length);
          }
        }
      } catch { /* Ignore a corrupt cache; the starter code list remains available. */ }
      try {
        const response = await fetch(WEB + "assets/dtc-database.json");
        if (!response.ok) throw new Error("Diagnostic library is not available from the current website deployment.");
        const rows: unknown = await response.json();
        const parsed = normalizeDatabase(rows);
        const count = Object.keys(parsed).length;
        if (count < 9000) throw new Error("The hosted diagnostic database did not pass the minimum-size check.");
        if (mounted) {
          setBundledDtc(parsed);
          setDatabaseCount(count);
          setDatabaseSyncTime(new Date().toISOString());
        }
        try { await AsyncStorage.setItem("@torqwise/dtc-database/v1", JSON.stringify(rows)); } catch { /* Cache storage is optional. */ }
      } catch (cause) {
        if (mounted) setDatabaseLoadError(cause instanceof Error ? cause.message : "Diagnostic library could not be refreshed.");
      }
      finally { if (mounted) setDatabaseReady(true); }
    };
    void loadDatabase();
    return () => { mounted = false; };
  }, [databaseRetry]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem("@torqwise/garage/v1")
      .then((stored) => {
        if (!mounted) return;
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
            setVehicles(parsed);
          }
        }
      })
      .catch(() => {
        if (mounted) setNotice("Saved garage could not be loaded. You can still add vehicles.");
      })
      .finally(() => {
        if (mounted) setGarageLoaded(true);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem("@torqwise/diagnostic-cases/v1")
      .then((stored) => {
        if (!mounted) return;
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.every((item) =>
            item && typeof item.id === "string" && typeof item.code === "string" &&
            typeof item.title === "string" && typeof item.meaning === "string" &&
            typeof item.savedAt === "string"
          )) setSavedCases(parsed as SavedCase[]);
        }
      })
      .catch(() => { if (mounted) setNotice("Saved diagnostic history could not be loaded."); })
      .finally(() => { if (mounted) setCasesLoaded(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!casesLoaded) return;
    AsyncStorage.setItem("@torqwise/diagnostic-cases/v1", JSON.stringify(savedCases))
      .catch(() => setNotice("Diagnostic history could not be saved on this device."));
  }, [savedCases, casesLoaded]);

  useEffect(() => {
    if (!garageLoaded) return;
    AsyncStorage.setItem("@torqwise/garage/v1", JSON.stringify(vehicles))
      .catch(() => setNotice("Garage changes could not be saved on this device."));
  }, [vehicles, garageLoaded]);
  const dtc = useMemo(() => bundledDtc[code.trim().toUpperCase()] || CODES[code.trim().toUpperCase()], [code, bundledDtc]);

  async function openWeb() { try { await Linking.openURL(WEB); } catch { setNotice("Could not open the TORQWISE website. Check your connection and try again."); } }
  async function decodeVin() {
    const value = vin.trim().toUpperCase();
    setError(""); setVinResult("");
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) {
      setError("Enter a valid 17-character VIN. The letters I, O and Q are not used."); return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/" + encodeURIComponent(value) + "?format=json", { signal: controller.signal });
      if (!response.ok) throw new Error("VIN service unavailable");
      const data = await response.json();
      const item = data?.Results?.[0];
      const details = [item?.ModelYear, item?.Make, item?.Model, item?.Trim, item?.VehicleType]
        .filter((v: unknown) => typeof v === "string" && v.trim() && v !== "Not Applicable");
      setVinResult(details.length ? details.join(" · ") : "No usable vehicle details were returned.");
      setNotice("Verify exact engine and configuration before ordering parts.");
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError"
        ? "VIN lookup timed out after 12 seconds. Check your connection and try again."
        : "VIN decoding is unavailable right now. Check your connection and try again.");
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }
  function saveDiagnosticCase() {
    const key = code.trim().toUpperCase();
    if (!dtc || !/^[PBCU][0-9A-F]{4}$/.test(key)) {
      setNotice("Enter a valid supported fault code before saving a case.");
      return;
    }
    if (savedCases.some(item => item.code === key && item.title === dtc.title)) {
      setNotice("This diagnostic case is already saved.");
      return;
    }
    const saved: SavedCase = {
      id: `${Date.now()}-${key}`,
      code: key,
      title: dtc.title,
      meaning: dtc.meaning,
      notes: caseNotes.trim().slice(0, 1200),
      savedAt: new Date().toISOString()
    };
    setSavedCases(current => [saved, ...current].slice(0, 100));
    setNotice(`${key} saved to diagnostic history on this device.`);
  }

  function addVehicle() {
    const value = vehicle.trim();
    if (!value) return;
    if (vehicles.some(v => v.toLowerCase() === value.toLowerCase())) { setNotice("That vehicle is already in your local garage."); return; }
    setVehicles(current => [value, ...current]); setVehicle(""); setNotice("Vehicle saved on this device.");
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#090b0f" />
      <View style={s.header}>
        <View style={s.brandMark}><Text style={s.markText}>T</Text></View>
        <View style={{ flex: 1 }}><Text style={s.brand}>TORQWISE</Text><Text style={s.subbrand}>AUTOMOTIVE INTELLIGENCE</Text></View>
        <View style={s.beta}><View style={s.dot}/><Text style={s.betaText}>MOBILE BETA</Text></View>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {tab === "Home" && <>
          <View style={s.hero}>
            <Text style={s.eyebrow}>THE TECHNICIAN'S WORKSPACE</Text>
            <Text accessibilityRole="header" style={s.heroTitle}>Find the fault.{"\n"}Prove the fix.</Text>
            <Text style={s.heroBody}>Automotive research and guided diagnostics, built for the real world.</Text>
            <TouchableOpacity style={s.primary} onPress={() => setTab("Diagnose")}><Text style={s.primaryText}>START DIAGNOSING  →</Text></TouchableOpacity>
            <View style={s.rule}/><Text style={s.mutedCaps}>RESEARCH. TEST. VERIFY.</Text>
          </View>
          <View style={s.panel}>
            <Text style={s.panelTitle}>The essentials, wherever you are</Text>
            <Text style={s.body}>Use the app for quick fault-code reference, VIN lookup, local diagnostic notes and AI research. Sign in with the same TORQWISE account you use on the website.</Text>
            <TouchableOpacity style={s.secondary} onPress={openWeb} accessibilityRole="link"><Text style={s.secondaryText}>PREFER A BIGGER SCREEN? OPEN WEBSITE  ↗</Text></TouchableOpacity>
          </View>
          <Text style={s.section}>QUICK ACCESS</Text>
          <View style={s.grid}>
            {([{title:"Fault codes", body:"Look up common OBD-II codes", icon:"⌁", action:() => setTab("Diagnose")},
              {title:"VIN decoder", body:"Identify a vehicle", icon:"▤", action:() => setTab("VIN")},
              {title:"My garage", body:"Keep vehicles together", icon:"▣", action:() => setTab("Garage")},
              {title:"AI research", body:"Research diagnostics, parts, and specs", icon:"⌕", action:() => setTab("Research")}] as const).map(card =>
              <TouchableOpacity key={card.title} style={s.quick} onPress={card.action}>
                <Text style={s.quickIcon}>{card.icon}</Text><Text style={s.quickTitle}>{card.title}</Text><Text style={s.quickBody}>{card.body}</Text>
              </TouchableOpacity>)}
          </View>
          <Text style={[s.section,{marginTop:24}]}>YOUR TORQWISE ACCOUNT</Text>
          <View style={s.panel}>
            {authLoading ? <View style={s.formRow}><ActivityIndicator color="#ef5058"/><Text style={s.body}>Connecting secure account service…</Text></View> :
              session ? <>
                <Text style={s.panelTitle}>Your TORQWISE account</Text>
                <Text style={s.body}>{session.user.email || "Signed in"}</Text>
                <View style={s.planCard}>
                  <Text style={s.planLabel}>AI RESEARCH ACCESS</Text>
                  <Text style={s.planValue}>{researchIsPro === true ? "PRO TECHNICIAN · UNLIMITED" : researchIsPro === false ? "FREE PLAN" : "VERIFIED WHEN RESEARCH RUNS"}</Text>
                  {researchRemaining !== null && researchIsPro !== true && <Text style={s.disclaimer}>{researchRemaining} free reports remaining this month.</Text>}
                </View>
                <Text style={s.disclaimer}>The app and website are separate interfaces for the same TORQWISE service. The same features and plan benefits should be available on both; the website is optimized for longer, detailed sessions.</Text>
                <TouchableOpacity style={s.secondary} onPress={openWeb} accessibilityRole="link"><Text style={s.secondaryText}>OPEN TORQWISE WEBSITE  ↗</Text></TouchableOpacity>
                <TouchableOpacity style={s.secondary} onPress={signOut} disabled={authBusy}><Text style={s.secondaryText}>{authBusy ? "PLEASE WAIT…" : "SIGN OUT"}</Text></TouchableOpacity>
              </> : <>
                <Text style={s.panelTitle}>{authMode === "signin" ? "Sign in to TORQWISE" : "Create your TORQWISE account"}</Text>
                <Text style={s.body}>Use the same email and password as your TORQWISE website account.</Text>
                <TextInput style={s.input} value={authEmail} onChangeText={setAuthEmail} placeholder="Email address" placeholderTextColor="#7e8794" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" accessibilityLabel="Account email"/>
                <TextInput style={s.input} value={authPassword} onChangeText={setAuthPassword} placeholder="Password (8+ characters)" placeholderTextColor="#7e8794" secureTextEntry textContentType={authMode === "signin" ? "password" : "newPassword"} autoCapitalize="none" accessibilityLabel="Account password" onSubmitEditing={submitAuth}/>
                <TouchableOpacity style={s.primary} onPress={submitAuth} disabled={authBusy}><Text style={s.primaryText}>{authBusy ? "PLEASE WAIT…" : authMode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}</Text></TouchableOpacity>
                <TouchableOpacity style={s.secondary} onPress={() => { setAuthMode(current => current === "signin" ? "signup" : "signin"); setAuthMessage(""); }}><Text style={s.secondaryText}>{authMode === "signin" ? "NEW TO TORQWISE? CREATE AN ACCOUNT" : "ALREADY HAVE AN ACCOUNT? SIGN IN"}</Text></TouchableOpacity>
              </>}
            {!!authMessage && <Text style={s.error}>{authMessage}</Text>}
          </View>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Privacy & local data</Text>
            <Text style={s.body}>Your garage and saved diagnostic cases stay on this device. AI research questions and vehicle details you submit are sent to TORQWISE's server-side research service. Read the policy for more details.</Text>
            <TouchableOpacity style={s.secondary} onPress={() => Linking.openURL(WEB + "privacy.html")} accessibilityRole="link"><Text style={s.secondaryText}>READ TORQWISE PRIVACY POLICY  ↗</Text></TouchableOpacity>
          </View>
          <View style={s.panel}><Text style={s.panelTitle}>Built for evidence, not guesswork.</Text><Text style={s.body}>Code descriptions are starting points. Confirm faults with measurements and service information for the exact vehicle.</Text></View>
        </>}

        {tab === "Diagnose" && <>
          <Text style={s.eyebrow}>DIAGNOSTIC WORKSPACE</Text><Text accessibilityRole="header" style={s.pageTitle}>Fault code lookup</Text>
          <Text style={s.body}>Search the generic OBD-II library, then verify the cause with testing.</Text>
          <View style={s.databasePill}><View style={[s.dot, databaseCount >= 9000 ? {backgroundColor:"#58cf9a"} : {backgroundColor:"#e9ad58"}]}/><Text style={s.databaseText}>{databaseCount >= 9000 ? `${databaseCount.toLocaleString()} GENERIC CODES AVAILABLE` : databaseReady ? "STARTER CODE SET · FULL LIBRARY UNAVAILABLE" : "LOADING DIAGNOSTIC LIBRARY…"}</Text></View>
          {databaseCount >= 9000 && !!databaseSyncTime && <Text style={s.mutedCaps}>LIBRARY REFRESHED {new Date(databaseSyncTime).toLocaleTimeString()}</Text>}
          {databaseReady && databaseCount < 9000 && <View style={s.panel}>
            <Text style={s.panelTitle}>Full diagnostic library unavailable</Text>
            <Text style={s.body}>{databaseLoadError || "The app is using its small starter set. Connect to the internet and try refreshing the library."}</Text>
            <TouchableOpacity style={s.secondary} onPress={() => { setDatabaseReady(false); setDatabaseRetry(value => value + 1); }} accessibilityRole="button">
              <Text style={s.secondaryText}>RETRY DIAGNOSTIC LIBRARY</Text>
            </TouchableOpacity>
          </View>}
          <TextInput style={s.input} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="Enter code, e.g. P0300" placeholderTextColor="#7e8794" accessibilityLabel="OBD-II diagnostic trouble code"/>
          {dtc ? <View style={s.panel}>
            <View style={s.codeBadge}><Text style={s.codeBadgeText}>{code.trim().toUpperCase()}</Text></View>
            <Text style={s.panelTitle}>{dtc.title}</Text><Text style={s.label}>WHAT IT MEANS</Text><Text style={s.body}>{dtc.meaning}</Text>
            {!!dtc.causes?.length && <><Text style={s.label}>POSSIBLE CAUSES IN THE REFERENCE DATA</Text><Text style={s.body}>{dtc.causes.join(" · ")}</Text></>}
            {!!dtc.symptoms?.length && <><Text style={s.label}>ASSOCIATED SYMPTOMS</Text><Text style={s.body}>{dtc.symptoms.join(" · ")}</Text></>}
            <Text style={s.label}>SUGGESTED NEXT STEPS</Text><Text style={s.body}>{dtc.steps}</Text>
            <Text style={s.label}>TECHNICIAN NOTES (OPTIONAL)</Text>
            <TextInput style={[s.input,{minHeight:82,textAlignVertical:"top"}]} value={caseNotes} onChangeText={setCaseNotes} placeholder="Record test results, measurements, symptoms, or what you have verified…" placeholderTextColor="#7e8794" multiline maxLength={1200} accessibilityLabel="Technician notes for saved diagnostic case"/>
            <Text style={s.counter}>{caseNotes.length}/1200</Text>
            <TouchableOpacity style={s.secondary} onPress={saveDiagnosticCase}><Text style={s.secondaryText}>SAVE TO DIAGNOSTIC HISTORY</Text></TouchableOpacity>
            {!!dtc.sources?.length && <><Text style={s.label}>REFERENCE SOURCES</Text>{dtc.sources.map(source => <TouchableOpacity key={source} onPress={() => Linking.openURL(source)}><Text style={s.sourceLink}>{source}</Text></TouchableOpacity>)}</>}
            <TouchableOpacity style={s.primary} onPress={openWeb}><Text style={s.primaryText}>OPEN WEBSITE RESEARCH VIEW  ↗</Text></TouchableOpacity>
          </View> : <View style={s.panel}><Text style={s.panelTitle}>No starter definition found</Text><Text style={s.body}>The full library is not available on this connection. Try again later or open the TORQWISE workspace to continue researching other codes.</Text><TouchableOpacity style={s.secondary} onPress={openWeb}><Text style={s.secondaryText}>OPEN TORQWISE WEB</Text></TouchableOpacity></View>}
          <Text style={s.disclaimer}>Generic OBD-II guidance only. Definitions and test procedures vary by vehicle; this is not a confirmed diagnosis.</Text>
        </>}

        {tab === "VIN" && <>
          <Text style={s.eyebrow}>VEHICLE IDENTIFICATION</Text><Text accessibilityRole="header" style={s.pageTitle}>Decode a VIN</Text>
          <Text style={s.body}>Enter a 17-character VIN to retrieve available manufacturer-reported details from NHTSA.</Text>
          <TextInput style={s.input} value={vin} onChangeText={v => {setVin(v.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0,17));setError("");}} autoCapitalize="characters" autoCorrect={false} maxLength={17} placeholder="17-character VIN" placeholderTextColor="#7e8794" accessibilityLabel="Vehicle identification number"/>
          <Text style={s.counter}>{vin.length}/17 CHARACTERS</Text>
          <TouchableOpacity style={[s.primary, loading && {opacity:0.6}]} disabled={loading} onPress={decodeVin}>{loading ? <ActivityIndicator color="#fff"/> : <Text style={s.primaryText}>DECODE VEHICLE  →</Text>}</TouchableOpacity>
          {!!error && <Text style={s.error}>{error}</Text>}
          {!!vinResult && <View style={s.panel}><Text style={s.label}>DECODED VEHICLE DETAILS</Text><Text style={s.panelTitle}>{vinResult}</Text><Text style={s.body}>Confirm engine, drivetrain, trim, and production details before making a repair or parts decision.</Text><TouchableOpacity style={s.secondary} onPress={() => {setVehicle(vinResult);setTab("Garage");}}><Text style={s.secondaryText}>ADD DETAILS TO GARAGE</Text></TouchableOpacity></View>}
          <Text style={s.disclaimer}>VIN decoding is not an OEM parts catalogue and may not return every configuration detail.</Text>
        </>}

        {tab === "Tools" && <>
          <Text style={s.eyebrow}>MOBILE WORKSHOP TOOLS</Text>
          <Text accessibilityRole="header" style={s.pageTitle}>Parts, service & planning</Text>
          <Text style={s.body}>Use these tools directly in the app. Supplier and web searches open separately; AI-assisted research uses your TORQWISE account and server-enforced plan allowance.</Text>
          <Text style={s.label}>VEHICLE / EQUIPMENT</Text>
          <TextInput style={s.input} value={toolVehicle} onChangeText={setToolVehicle} placeholder="Year, make, model, engine or serial" placeholderTextColor="#7e8794" accessibilityLabel="Vehicle or equipment for workshop tools"/>
          <Text style={s.label}>PART, REPAIR OR QUESTION</Text>
          <TextInput style={[s.input,{minHeight:84,textAlignVertical:"top"}]} value={toolRequest} onChangeText={setToolRequest} placeholder="e.g. front wheel bearing, P0420 diagnosis, estimate line items…" placeholderTextColor="#7e8794" multiline maxLength={1200} accessibilityLabel="Part, repair or workshop question"/>
          <Text style={s.label}>REGION (OPTIONAL)</Text>
          <TextInput style={s.input} value={toolRegion} onChangeText={setToolRegion} placeholder="Country or delivery region" placeholderTextColor="#7e8794" accessibilityLabel="Parts and service search region"/>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Find parts and compare prices</Text>
            <Text style={s.body}>Search shopping results or look for OEM catalog references. Confirm exact fitment, availability, shipping and final price with the supplier before ordering.</Text>
            <TouchableOpacity style={s.primary} onPress={() => void openToolSearch("shopping")} accessibilityRole="button"><Text style={s.primaryText}>COMPARE PART PRICES ↗</Text></TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={() => void openToolSearch("oem")} accessibilityRole="button"><Text style={s.secondaryText}>SEARCH OEM PART REFERENCES ↗</Text></TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={() => sendToolToResearch("parts","Research candidate replacement parts, OEM references, fitment evidence, alternatives and source links for this request. Do not claim confirmed fitment without authoritative evidence.")} accessibilityRole="button"><Text style={s.secondaryText}>RESEARCH THIS PART WITH TORQWISE →</Text></TouchableOpacity>
          </View>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Repair estimate comparison</Text>
            <Text style={s.body}>Enter the repair job or estimate line items above, then send them to AI Research for an organized comparison, questions to ask, and clearly flagged uncertainties.</Text>
            <TouchableOpacity style={s.primary} onPress={() => sendToolToResearch("service","Help compare this repair estimate. Organize the line items, distinguish parts and labour where details allow, identify missing information, and suggest questions to ask the repair shop. Do not invent local labour rates or claim a quote is fair without evidence.")} accessibilityRole="button"><Text style={s.primaryText}>PREPARE ESTIMATE REVIEW →</Text></TouchableOpacity>
          </View>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Recalls, bulletins & service information</Text>
            <Text style={s.body}>Search for official recall notices, technical service bulletins, service procedures, wiring diagrams and specifications. Verify year, model, engine, serial/VIN and market applicability.</Text>
            <TouchableOpacity style={s.secondary} onPress={() => void openToolSearch("recall")} accessibilityRole="button"><Text style={s.secondaryText}>SEARCH RECALLS & SERVICE BULLETINS ↗</Text></TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={() => void openToolSearch("service")} accessibilityRole="button"><Text style={s.secondaryText}>SEARCH SERVICE SPECS & DIAGRAMS ↗</Text></TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={() => sendToolToResearch("bulletin","Research applicable recalls, technical service bulletins, campaigns and official service information. Prefer manufacturer or government sources and state uncertainty when exact applicability cannot be confirmed.")} accessibilityRole="button"><Text style={s.secondaryText}>ASK TORQWISE TO RESEARCH THIS →</Text></TouchableOpacity>
          </View>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Maintenance planning</Text>
            <Text style={s.body}>Ask for a maintenance plan based on the exact vehicle/equipment, mileage or hours, operating conditions and available service information.</Text>
            <TouchableOpacity style={s.secondary} onPress={() => sendToolToResearch("service","Build a maintenance planning outline for this vehicle/equipment using source-linked service information. Ask for missing mileage/hours, operating conditions and engine details rather than inventing interval specifications.")} accessibilityRole="button"><Text style={s.secondaryText}>BUILD A MAINTENANCE PLAN →</Text></TouchableOpacity>
          </View>
          <Text style={s.disclaimer}>External searches open a browser and may not have live fitment or price verification. AI reports use the same server-side account allowance as TORQWISE web research. These tools do not replace OEM service information or professional verification.</Text>
        </>}

        {tab === "Research" && <>
          <Text style={s.eyebrow}>SOURCE-LINKED AI WORKSPACE</Text><Text accessibilityRole="header" style={s.pageTitle}>Technical research</Text>
          <Text style={s.body}>Ask a focused automotive or heavy-equipment question. TORQWISE checks the same account and subscription entitlement used by the website.</Text>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Your access</Text>
            <Text style={s.planValue}>{!session ? "SIGN IN TO CHECK YOUR PLAN" : researchIsPro === true ? "PRO TECHNICIAN · UNLIMITED RESEARCH" : researchIsPro === false ? "FREE PLAN" : "PLAN VERIFIED WHEN RESEARCH RUNS"}</Text>
            {researchRemaining !== null && researchIsPro !== true && <Text style={s.disclaimer}>{researchRemaining} free reports remaining this month.</Text>}
            <Text style={s.disclaimer}>Your server-verified account determines research access. Use the app or website independently. Both should offer the same feature availability and subscription benefits; the website is better suited to extended work on a larger screen.</Text>
            <TouchableOpacity style={s.secondary} onPress={openWeb} accessibilityRole="link"><Text style={s.secondaryText}>OPEN WEBSITE VIEW  ↗</Text></TouchableOpacity>
          </View>
          {!session && <View style={s.panel}><Text style={s.panelTitle}>Sign-in required</Text><Text style={s.body}>Sign in with your existing TORQWISE account on the Home screen to use AI research.</Text><TouchableOpacity style={s.primary} onPress={() => setTab("Home")}><Text style={s.primaryText}>GO TO ACCOUNT  →</Text></TouchableOpacity></View>}
          <Text style={s.label}>VEHICLE / EQUIPMENT (OPTIONAL)</Text>
          <TextInput style={s.input} value={researchAsset} onChangeText={setResearchAsset} placeholder="e.g. 2018 Ford F-150 5.0L" placeholderTextColor="#7e8794" accessibilityLabel="Vehicle or equipment"/>
          <Text style={s.label}>RESEARCH CATEGORY</Text>
          <View style={s.topicRow}>
            {([{value:"diagnostic",label:"Diagnostics"},{value:"service",label:"Service"},{value:"parts",label:"Parts"},{value:"spec",label:"Specs"},{value:"diagram",label:"Diagrams"},{value:"bulletin",label:"Bulletins"},{value:"general",label:"General"}] as const).map(item =>
              <TouchableOpacity key={item.value} style={[s.topicChip,researchTopic===item.value&&s.topicActive]} onPress={() => setResearchTopic(item.value)} accessibilityRole="button" accessibilityState={{selected:researchTopic===item.value}}>
                <Text style={[s.topicText,researchTopic===item.value&&s.topicTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.label}>YOUR QUESTION</Text>
          <TextInput style={[s.input,{minHeight:110,textAlignVertical:"top"}]} value={researchQuestion} onChangeText={setResearchQuestion} placeholder="Describe the fault, symptoms, part number, specification, or test result…" placeholderTextColor="#7e8794" multiline maxLength={1800} accessibilityLabel="Technical research question"/>
          <TouchableOpacity style={[s.primary,researchBusy&&{opacity:0.6}]} onPress={submitResearch} disabled={researchBusy||!session}>
            {researchBusy ? <ActivityIndicator color="#fff"/> : <Text style={s.primaryText}>RUN AI RESEARCH  →</Text>}
          </TouchableOpacity>
          {!!researchError && <Text style={s.error}>{researchError}</Text>}
          {!!researchAnswer && <View style={s.panel}>
            <Text style={s.label}>TORQWISE RESEARCH REPORT</Text>
            <Text style={s.body}>{researchAnswer}</Text>
            {!!researchSources.length && <>
              <Text style={s.label}>SOURCE LINKS</Text>
              {researchSources.map((source,index)=><TouchableOpacity key={source.url} onPress={() => Linking.openURL(source.url!)} accessibilityRole="link"><Text style={s.sourceLink}>{source.title || source.url}</Text></TouchableOpacity>)}
            </>}
            {researchIsPro === true ? <Text style={s.mutedCaps}>PRO TECHNICIAN ACCESS · UNLIMITED RESEARCH</Text> : researchRemaining !== null && <Text style={s.mutedCaps}>{researchRemaining} FREE REPORTS REMAINING THIS MONTH</Text>}
            <Text style={s.disclaimer}>Research supports troubleshooting; it is not a confirmed diagnosis. Verify specifications and procedures for the exact vehicle or machine.</Text>
          </View>}
        </>}

        {tab === "Garage" && <>
          <Text style={s.eyebrow}>YOUR VEHICLES</Text><Text accessibilityRole="header" style={s.pageTitle}>My garage</Text>
          <Text style={s.body}>Keep a working list of vehicles for your next diagnostic session.</Text>
          <View style={s.formRow}><TextInput style={[s.input,{flex:1,marginBottom:0}]} value={vehicle} onChangeText={setVehicle} placeholder="e.g. 2018 Ford F-150 5.0L" placeholderTextColor="#7e8794" returnKeyType="done" onSubmitEditing={addVehicle}/><TouchableOpacity style={s.addButton} onPress={addVehicle}><Text style={s.primaryText}>ADD</Text></TouchableOpacity></View>
          {vehicles.length === 0 ? <View style={s.empty}><Text style={s.emptyIcon}>▣</Text><Text style={s.panelTitle}>Your garage is ready</Text><Text style={s.body}>Add a vehicle to start your local list. Cloud sync and account-linked history are planned for a later integration phase.</Text></View> :
            vehicles.map((v,i)=><View style={s.vehicleRow} key={v+i}><View style={{flex:1}}><Text style={s.panelTitle}>{v}</Text><Text style={s.mutedCaps}>SAVED ON THIS DEVICE</Text></View><TouchableOpacity onPress={()=>setVehicles(current=>current.filter((_,index)=>index!==i))}><Text style={s.remove}>REMOVE</Text></TouchableOpacity></View>)}
          <Text style={s.section}>SAVED DIAGNOSTIC CASES ({savedCases.length})</Text>
          {savedCases.length === 0 ? <View style={s.empty}><Text style={s.emptyIcon}>⌁</Text><Text style={s.panelTitle}>No saved cases yet</Text><Text style={s.body}>Look up a fault code and tap “Save to diagnostic history” to keep a reference on this device.</Text></View> :
            savedCases.map(item => <View style={s.vehicleRow} key={item.id}>
              <View style={{flex:1}}>
                <Text style={s.codeBadgeText}>{item.code}</Text>
                <Text style={s.panelTitle}>{item.title}</Text>
                <Text style={s.body}>{item.meaning}</Text>
                {!!item.notes && <><Text style={s.label}>TECHNICIAN NOTES</Text><Text style={s.body}>{item.notes}</Text></>}
                <Text style={s.mutedCaps}>{new Date(item.savedAt).toLocaleDateString()}</Text>
              </View>
              <TouchableOpacity onPress={() => { setCode(item.code); setTab("Diagnose"); }} accessibilityLabel={`Reopen saved case ${item.code}`}><Text style={s.sourceLink}>OPEN</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setSavedCases(current => current.filter(saved => saved.id !== item.id))} accessibilityLabel={`Delete saved case ${item.code}`}><Text style={s.remove}>DELETE</Text></TouchableOpacity>
            </View>)}
          <Text style={s.disclaimer}>Diagnostic history is stored locally on this device. It does not sync to an account or cloud service yet.</Text>
          <Text style={s.disclaimer}>Garage entries are saved on this device. Cloud sync and account-linked history are not connected yet.</Text>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Manage local data</Text>
            <Text style={s.body}>Remove your saved garage vehicles and diagnostic cases from this device. This does not delete your TORQWISE online account.</Text>
            <TouchableOpacity style={s.secondary} onPress={clearLocalData} accessibilityRole="button"><Text style={s.secondaryText}>CLEAR GARAGE & DIAGNOSTIC HISTORY</Text></TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={() => Linking.openURL(WEB + "privacy.html")} accessibilityRole="link"><Text style={s.secondaryText}>READ PRIVACY POLICY  ↗</Text></TouchableOpacity>
          </View>
        </>}

        {!!notice && <TouchableOpacity style={s.notice} onPress={()=>setNotice("")}><Text style={s.noticeText}>{notice}  ×</Text></TouchableOpacity>}
        <View style={s.footer}><Text style={s.footerBrand}>TORQWISE</Text><Text style={s.footerText}>Automotive intelligence for better decisions.</Text><TouchableOpacity onPress={openWeb}><Text style={s.footerLink}>OPEN WEB WORKSPACE  ↗</Text></TouchableOpacity></View>
      </ScrollView>
      <View style={s.tabs}>{TABS.map(item=>{const active=tab===item.label;return <TouchableOpacity key={item.label} style={s.tab} onPress={()=>{setTab(item.label);setNotice("");}} accessibilityRole="tab" accessibilityLabel={`${item.label} screen`} accessibilityHint={`Open the ${item.label} section`} accessibilityState={{selected:active}}><Text accessible={false} style={[s.tabIcon,active&&s.active]}>{item.icon}</Text><Text accessible={false} style={[s.tabLabel,active&&s.active]}>{item.label.toUpperCase()}</Text>{active&&<View accessible={false} style={s.indicator}/>}</TouchableOpacity>})}</View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#090b0f"},
  header:{minHeight:70,paddingHorizontal:18,paddingVertical:12,flexDirection:"row",alignItems:"center",gap:10,borderBottomWidth:1,borderBottomColor:"#252a33"},
  brandMark:{width:38,height:38,borderRadius:11,backgroundColor:"#ef343d",alignItems:"center",justifyContent:"center"},
  markText:{color:"#fff",fontSize:25,fontWeight:"900",fontStyle:"italic"},
  brand:{color:"#f8fafc",fontSize:17,fontWeight:"900",letterSpacing:1.5},
  subbrand:{color:"#9aa3af",fontSize:8,fontWeight:"700",letterSpacing:1.3,marginTop:3},
  beta:{flexDirection:"row",alignItems:"center",gap:6,borderWidth:1,borderColor:"#45404a",borderRadius:20,paddingHorizontal:9,paddingVertical:6},
  dot:{width:6,height:6,borderRadius:3,backgroundColor:"#ef343d"},
  betaText:{color:"#c9ced6",fontSize:9,fontWeight:"800",letterSpacing:0.8},
  content:{padding:18,paddingBottom:34},
  hero:{backgroundColor:"#11151c",borderColor:"#2b303a",borderWidth:1,borderRadius:22,padding:22,marginBottom:28},
  eyebrow:{color:"#ef5058",fontSize:10,letterSpacing:1.8,fontWeight:"900",marginBottom:12},
  heroTitle:{color:"#fff",fontSize:38,lineHeight:42,fontWeight:"900",letterSpacing:-1.2},
  heroBody:{color:"#b6bec9",fontSize:15,lineHeight:23,marginTop:13,marginBottom:22},
  primary:{minHeight:52,backgroundColor:"#e8323b",borderRadius:12,alignItems:"center",justifyContent:"center",paddingHorizontal:15,marginTop:12},
  primaryText:{color:"#fff",fontSize:11,fontWeight:"900",letterSpacing:0.7,textAlign:"center"},
  rule:{height:1,backgroundColor:"#343944",marginTop:22,marginBottom:12},
  mutedCaps:{color:"#838c99",fontSize:9,fontWeight:"800",letterSpacing:1.2},
  section:{color:"#d9dee6",fontSize:11,fontWeight:"900",letterSpacing:1.5,marginBottom:12},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:10,marginBottom:18},
  quick:{width:"48%",flexGrow:1,minHeight:137,backgroundColor:"#11151c",borderWidth:1,borderColor:"#292f39",borderRadius:16,padding:14},
  quickIcon:{color:"#ef5058",fontSize:23,fontWeight:"700",marginBottom:10},
  quickTitle:{color:"#f6f7f9",fontSize:14,fontWeight:"800",marginBottom:6},
  quickBody:{color:"#9ba4b1",fontSize:11,lineHeight:16},
  panel:{backgroundColor:"#15171d",borderRadius:16,borderWidth:1,borderColor:"#34303a",padding:17,marginTop:8},
  panelTitle:{color:"#f5f6f8",fontSize:15,fontWeight:"800",marginBottom:8,lineHeight:22},
  body:{color:"#b1bac6",fontSize:13,lineHeight:20,marginBottom:12},
  pageTitle:{color:"#fff",fontSize:29,lineHeight:35,fontWeight:"900",letterSpacing:-0.7,marginBottom:10},
  input:{backgroundColor:"#141820",borderColor:"#343b47",borderWidth:1,borderRadius:12,paddingHorizontal:15,paddingVertical:14,color:"#fff",fontSize:16,marginTop:10,marginBottom:10},
  databasePill:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:7,borderWidth:1,borderColor:"#333a44",backgroundColor:"#11151c",borderRadius:8,paddingHorizontal:10,paddingVertical:8,marginBottom:8},
  databaseText:{color:"#b4bdc8",fontSize:9,fontWeight:"900",letterSpacing:0.5},
  sourceLink:{color:"#94baff",fontSize:10,lineHeight:15,marginBottom:7},
  planCard:{padding:12,borderRadius:12,borderWidth:1,borderColor:"#333b47",backgroundColor:"#11151c",marginVertical:8},
  planLabel:{color:"#8b95a3",fontSize:10,fontWeight:"800",letterSpacing:1.2},
  planValue:{color:"#f4f6f8",fontSize:12,fontWeight:"800",letterSpacing:0.5,marginVertical:5},
  topicRow:{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:8},
  topicChip:{borderWidth:1,borderColor:"#3a414d",borderRadius:18,paddingHorizontal:11,paddingVertical:8,backgroundColor:"#11151c"},
  topicActive:{borderColor:"#ef5058",backgroundColor:"#35191d"},
  topicText:{color:"#aab3c0",fontSize:10,fontWeight:"700"},
  topicTextActive:{color:"#fff"},
  codeBadge:{alignSelf:"flex-start",backgroundColor:"#3a171c",borderWidth:1,borderColor:"#8d2d35",borderRadius:7,paddingHorizontal:10,paddingVertical:6,marginBottom:13},
  codeBadgeText:{color:"#ff7b82",fontWeight:"900",fontSize:12,letterSpacing:1},
  label:{color:"#ef646b",fontSize:9,letterSpacing:1.3,fontWeight:"900",marginTop:9,marginBottom:7},
  secondary:{borderWidth:1,borderColor:"#555d6a",borderRadius:10,minHeight:48,alignItems:"center",justifyContent:"center",paddingHorizontal:12,marginTop:7},
  secondaryText:{color:"#f1f3f6",fontSize:10,fontWeight:"900",letterSpacing:0.6},
  disclaimer:{color:"#818b99",fontSize:10,lineHeight:16,marginTop:16,marginBottom:10},
  counter:{textAlign:"right",color:"#818b99",fontSize:9,fontWeight:"800",letterSpacing:1,marginBottom:5},
  error:{color:"#ff7b82",fontSize:12,lineHeight:18,marginTop:8},
  formRow:{flexDirection:"row",alignItems:"center",gap:8,marginBottom:8},
  addButton:{minHeight:48,paddingHorizontal:17,borderRadius:11,backgroundColor:"#e8323b",alignItems:"center",justifyContent:"center"},
  empty:{marginTop:12,padding:22,borderRadius:16,borderWidth:1,borderStyle:"dashed",borderColor:"#3b424e",alignItems:"center"},
  emptyIcon:{color:"#ef5058",fontSize:34,marginBottom:12},
  vehicleRow:{flexDirection:"row",alignItems:"center",gap:12,padding:13,borderWidth:1,borderColor:"#2b313b",borderRadius:13,backgroundColor:"#11151c",marginTop:9},
  remove:{color:"#ff8188",fontSize:9,fontWeight:"900",letterSpacing:0.4},
  notice:{padding:12,borderRadius:10,backgroundColor:"#27202a",borderWidth:1,borderColor:"#56313b",marginTop:12},
  noticeText:{color:"#f0c8cb",fontSize:11,lineHeight:16},
  footer:{borderTopWidth:1,borderTopColor:"#292f39",marginTop:30,paddingTop:20,alignItems:"center"},
  footerBrand:{color:"#f7f8fa",fontSize:12,fontWeight:"900",letterSpacing:2},
  footerText:{color:"#8993a0",fontSize:11,marginTop:7,marginBottom:13},
  footerLink:{color:"#ff6b73",fontSize:10,fontWeight:"900",letterSpacing:0.7,padding:8},
  tabs:{minHeight:68,backgroundColor:"#0d1015",borderTopWidth:1,borderTopColor:"#282e38",flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingBottom:5},
  tab:{minWidth:62,minHeight:48,alignItems:"center",justifyContent:"center",paddingTop:7,paddingHorizontal:6,position:"relative"},
  tabIcon:{color:"#737d8b",fontSize:20,marginBottom:3},
  tabLabel:{color:"#737d8b",fontSize:8,fontWeight:"900",letterSpacing:0.7},
  active:{color:"#ff5962"},
  indicator:{position:"absolute",top:-7,width:22,height:2,backgroundColor:"#ef343d",borderRadius:2},
});