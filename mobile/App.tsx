import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, Linking, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type Tab = "Home" | "Diagnose" | "VIN" | "Garage";
type Dtc = { title: string; meaning: string; steps: string; causes?: string[]; symptoms?: string[]; sources?: string[] };
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
  { label: "Home", icon: "⌂" }, { label: "Diagnose", icon: "⌁" }, { label: "VIN", icon: "▤" }, { label: "Garage", icon: "▣" }
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
        }
        try { await AsyncStorage.setItem("@torqwise/dtc-database/v1", JSON.stringify(rows)); } catch { /* Cache storage is optional. */ }
      } catch { /* Keep cached or starter data available when offline. */ }
      finally { if (mounted) setDatabaseReady(true); }
    };
    void loadDatabase();
    return () => { mounted = false; };
  }, []);

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
    if (!garageLoaded) return;
    AsyncStorage.setItem("@torqwise/garage/v1", JSON.stringify(vehicles))
      .catch(() => setNotice("Garage changes could not be saved on this device."));
  }, [vehicles, garageLoaded]);
  const dtc = useMemo(() => bundledDtc[code.trim().toUpperCase()] || CODES[code.trim().toUpperCase()], [code, bundledDtc]);

  async function openWeb() { await Linking.openURL(WEB); }
  async function decodeVin() {
    const value = vin.trim().toUpperCase();
    setError(""); setVinResult("");
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) {
      setError("Enter a valid 17-character VIN. The letters I, O and Q are not used."); return;
    }
    setLoading(true);
    try {
      const response = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/" + encodeURIComponent(value) + "?format=json");
      if (!response.ok) throw new Error("VIN service unavailable");
      const data = await response.json();
      const item = data?.Results?.[0];
      const details = [item?.ModelYear, item?.Make, item?.Model, item?.Trim, item?.VehicleType]
        .filter((v: unknown) => typeof v === "string" && v.trim() && v !== "Not Applicable");
      setVinResult(details.length ? details.join(" · ") : "No usable vehicle details were returned.");
      setNotice("Verify exact engine and configuration before ordering parts.");
    } catch { setError("VIN decoding is unavailable right now. Check your connection and try again."); }
    finally { setLoading(false); }
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
            <Text style={s.heroTitle}>Find the fault.{"\n"}Prove the fix.</Text>
            <Text style={s.heroBody}>Automotive research and guided diagnostics, built for the real world.</Text>
            <TouchableOpacity style={s.primary} onPress={() => setTab("Diagnose")}><Text style={s.primaryText}>START DIAGNOSING  →</Text></TouchableOpacity>
            <View style={s.rule}/><Text style={s.mutedCaps}>RESEARCH. TEST. VERIFY.</Text>
          </View>
          <Text style={s.section}>QUICK ACCESS</Text>
          <View style={s.grid}>
            {([{title:"Fault codes", body:"Look up common OBD-II codes", icon:"⌁", action:() => setTab("Diagnose")},
              {title:"VIN decoder", body:"Identify a vehicle", icon:"▤", action:() => setTab("VIN")},
              {title:"My garage", body:"Keep vehicles together", icon:"▣", action:() => setTab("Garage")},
              {title:"Research hub", body:"Open full TORQWISE workspace", icon:"↗", action:openWeb}] as const).map(card =>
              <TouchableOpacity key={card.title} style={s.quick} onPress={card.action}>
                <Text style={s.quickIcon}>{card.icon}</Text><Text style={s.quickTitle}>{card.title}</Text><Text style={s.quickBody}>{card.body}</Text>
              </TouchableOpacity>)}
          </View>
          <View style={s.panel}><Text style={s.panelTitle}>Built for evidence, not guesswork.</Text><Text style={s.body}>Code descriptions are starting points. Confirm faults with measurements and service information for the exact vehicle.</Text></View>
        </>}

        {tab === "Diagnose" && <>
          <Text style={s.eyebrow}>DIAGNOSTIC WORKSPACE</Text><Text style={s.pageTitle}>Fault code lookup</Text>
          <Text style={s.body}>Search the generic OBD-II library, then verify the cause with testing.</Text>\n          <View style={s.databasePill}><View style={[s.dot, databaseCount >= 9000 ? {backgroundColor:"#58cf9a"} : {backgroundColor:"#e9ad58"}]}/><Text style={s.databaseText}>{databaseCount >= 9000 ? `${databaseCount.toLocaleString()} GENERIC CODES AVAILABLE` : databaseReady ? "STARTER CODE SET · FULL LIBRARY UNAVAILABLE" : "LOADING DIAGNOSTIC LIBRARY…"}</Text></View>
          <TextInput style={s.input} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="Enter code, e.g. P0300" placeholderTextColor="#7e8794" accessibilityLabel="OBD-II diagnostic trouble code"/>
          {dtc ? <View style={s.panel}>
            <View style={s.codeBadge}><Text style={s.codeBadgeText}>{code.trim().toUpperCase()}</Text></View>
            <Text style={s.panelTitle}>{dtc.title}</Text><Text style={s.label}>WHAT IT MEANS</Text><Text style={s.body}>{dtc.meaning}</Text>
            {!!dtc.causes?.length && <><Text style={s.label}>POSSIBLE CAUSES IN THE REFERENCE DATA</Text><Text style={s.body}>{dtc.causes.join(" · ")}</Text></>}
            {!!dtc.symptoms?.length && <><Text style={s.label}>ASSOCIATED SYMPTOMS</Text><Text style={s.body}>{dtc.symptoms.join(" · ")}</Text></>}
            {!!dtc.causes?.length && <><Text style={s.label}>POSSIBLE CAUSES IN THE REFERENCE DATA</Text><Text style={s.body}>{dtc.causes.join(" · ")}</Text></>}
            {!!dtc.symptoms?.length && <><Text style={s.label}>ASSOCIATED SYMPTOMS</Text><Text style={s.body}>{dtc.symptoms.join(" · ")}</Text></>}
            <Text style={s.label}>SUGGESTED NEXT STEPS</Text><Text style={s.body}>{dtc.steps}</Text>
            {!!dtc.sources?.length && <><Text style={s.label}>REFERENCE SOURCES</Text>{dtc.sources.map(source => <TouchableOpacity key={source} onPress={() => Linking.openURL(source)}><Text style={s.sourceLink}>{source}</Text></TouchableOpacity>)}</>}
            {!!dtc.sources?.length && <><Text style={s.label}>REFERENCE SOURCES</Text>{dtc.sources.map(source => <TouchableOpacity key={source} onPress={() => Linking.openURL(source)}><Text style={s.sourceLink}>{source}</Text></TouchableOpacity>)}</>}
            <TouchableOpacity style={s.primary} onPress={openWeb}><Text style={s.primaryText}>OPEN FULL RESEARCH HUB  ↗</Text></TouchableOpacity>
          </View> : <View style={s.panel}><Text style={s.panelTitle}>No starter definition found</Text><Text style={s.body}>The full library is not available on this connection. Try again later or open the TORQWISE workspace to continue researching other codes.</Text><TouchableOpacity style={s.secondary} onPress={openWeb}><Text style={s.secondaryText}>OPEN TORQWISE WEB</Text></TouchableOpacity></View>}
          <Text style={s.disclaimer}>Generic OBD-II guidance only. Definitions and test procedures vary by vehicle; this is not a confirmed diagnosis.</Text>
        </>}

        {tab === "VIN" && <>
          <Text style={s.eyebrow}>VEHICLE IDENTIFICATION</Text><Text style={s.pageTitle}>Decode a VIN</Text>
          <Text style={s.body}>Enter a 17-character VIN to retrieve available manufacturer-reported details from NHTSA.</Text>
          <TextInput style={s.input} value={vin} onChangeText={v => {setVin(v.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0,17));setError("");}} autoCapitalize="characters" autoCorrect={false} maxLength={17} placeholder="17-character VIN" placeholderTextColor="#7e8794" accessibilityLabel="Vehicle identification number"/>
          <Text style={s.counter}>{vin.length}/17 CHARACTERS</Text>
          <TouchableOpacity style={[s.primary, loading && {opacity:0.6}]} disabled={loading} onPress={decodeVin}>{loading ? <ActivityIndicator color="#fff"/> : <Text style={s.primaryText}>DECODE VEHICLE  →</Text>}</TouchableOpacity>
          {!!error && <Text style={s.error}>{error}</Text>}
          {!!vinResult && <View style={s.panel}><Text style={s.label}>DECODED VEHICLE DETAILS</Text><Text style={s.panelTitle}>{vinResult}</Text><Text style={s.body}>Confirm engine, drivetrain, trim, and production details before making a repair or parts decision.</Text><TouchableOpacity style={s.secondary} onPress={() => {setVehicle(vinResult);setTab("Garage");}}><Text style={s.secondaryText}>ADD DETAILS TO GARAGE</Text></TouchableOpacity></View>}
          <Text style={s.disclaimer}>VIN decoding is not an OEM parts catalogue and may not return every configuration detail.</Text>
        </>}

        {tab === "Garage" && <>
          <Text style={s.eyebrow}>YOUR VEHICLES</Text><Text style={s.pageTitle}>My garage</Text>
          <Text style={s.body}>Keep a working list of vehicles for your next diagnostic session.</Text>
          <View style={s.formRow}><TextInput style={[s.input,{flex:1,marginBottom:0}]} value={vehicle} onChangeText={setVehicle} placeholder="e.g. 2018 Ford F-150 5.0L" placeholderTextColor="#7e8794" returnKeyType="done" onSubmitEditing={addVehicle}/><TouchableOpacity style={s.addButton} onPress={addVehicle}><Text style={s.primaryText}>ADD</Text></TouchableOpacity></View>
          {vehicles.length === 0 ? <View style={s.empty}><Text style={s.emptyIcon}>▣</Text><Text style={s.panelTitle}>Your garage is ready</Text><Text style={s.body}>Add a vehicle to start your local list. Cloud sync and account-linked history are planned for a later integration phase.</Text></View> :
            vehicles.map((v,i)=><View style={s.vehicleRow} key={v+i}><View style={{flex:1}}><Text style={s.panelTitle}>{v}</Text><Text style={s.mutedCaps}>SAVED ON THIS DEVICE</Text></View><TouchableOpacity onPress={()=>setVehicles(current=>current.filter((_,index)=>index!==i))}><Text style={s.remove}>REMOVE</Text></TouchableOpacity></View>)}
          <Text style={s.disclaimer}>Garage entries are saved on this device. Cloud sync and account-linked history are not connected yet.</Text>
        </>}

        {!!notice && <TouchableOpacity style={s.notice} onPress={()=>setNotice("")}><Text style={s.noticeText}>{notice}  ×</Text></TouchableOpacity>}
        <View style={s.footer}><Text style={s.footerBrand}>TORQWISE</Text><Text style={s.footerText}>Automotive intelligence for better decisions.</Text><TouchableOpacity onPress={openWeb}><Text style={s.footerLink}>OPEN WEB WORKSPACE  ↗</Text></TouchableOpacity></View>
      </ScrollView>
      <View style={s.tabs}>{TABS.map(item=>{const active=tab===item.label;return <TouchableOpacity key={item.label} style={s.tab} onPress={()=>{setTab(item.label);setNotice("");}} accessibilityRole="button" accessibilityState={{selected:active}}><Text style={[s.tabIcon,active&&s.active]}>{item.icon}</Text><Text style={[s.tabLabel,active&&s.active]}>{item.label.toUpperCase()}</Text>{active&&<View style={s.indicator}/>}</TouchableOpacity>})}</View>
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
  primary:{minHeight:49,backgroundColor:"#e8323b",borderRadius:12,alignItems:"center",justifyContent:"center",paddingHorizontal:15,marginTop:12},
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
  input:{backgroundColor:"#141820",borderColor:"#343b47",borderWidth:1,borderRadius:12,paddingHorizontal:15,paddingVertical:14,color:"#fff",fontSize:15,marginTop:10,marginBottom:10},
  databasePill:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:7,borderWidth:1,borderColor:"#333a44",backgroundColor:"#11151c",borderRadius:8,paddingHorizontal:10,paddingVertical:8,marginBottom:8},
  databaseText:{color:"#b4bdc8",fontSize:9,fontWeight:"900",letterSpacing:0.5},
  sourceLink:{color:"#94baff",fontSize:10,lineHeight:15,marginBottom:7},
  codeBadge:{alignSelf:"flex-start",backgroundColor:"#3a171c",borderWidth:1,borderColor:"#8d2d35",borderRadius:7,paddingHorizontal:10,paddingVertical:6,marginBottom:13},
  codeBadgeText:{color:"#ff7b82",fontWeight:"900",fontSize:12,letterSpacing:1},
  label:{color:"#ef646b",fontSize:9,letterSpacing:1.3,fontWeight:"900",marginTop:9,marginBottom:7},
  secondary:{borderWidth:1,borderColor:"#555d6a",borderRadius:10,minHeight:45,alignItems:"center",justifyContent:"center",paddingHorizontal:12,marginTop:7},
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
  tab:{minWidth:62,alignItems:"center",justifyContent:"center",paddingTop:7,position:"relative"},
  tabIcon:{color:"#737d8b",fontSize:20,marginBottom:3},
  tabLabel:{color:"#737d8b",fontSize:8,fontWeight:"900",letterSpacing:0.7},
  active:{color:"#ff5962"},
  indicator:{position:"absolute",top:-7,width:22,height:2,backgroundColor:"#ef343d",borderRadius:2},
});