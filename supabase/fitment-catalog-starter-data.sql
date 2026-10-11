-- TORQWISE reviewed starter fitment records.
-- These are conservative aftermarket cross-references, not OEM-certified guarantees.
-- Safe to re-run: each row is inserted only when its part/application combination is absent.
insert into public.fitment_applications
(part_number,brand,part_name,vehicle_year_start,vehicle_year_end,make,model,axle_position,market,status,evidence,fitment_notes,reviewer,reviewed_at,source_checked_at)
select v.part_number,v.brand,v.part_name,v.year_start,v.year_end,v.make,v.model,v.axle,v.market,'cross_reference',v.evidence::jsonb,v.notes,'TORQWISE initial catalog review',now(),now()
from (values
('WB510089','WJB','Front wheel bearing',2006,2016,'Honda','Civic','Front','North America',
 '[{"title":"WJB Automotive Buyer Guide 2022 Q2","url":"https://wjbautomotiveshop.com/wp-content/uploads/2022/06/WJB-Automotive_Buyers-Guide_2022Q2.pdf"},{"title":"CARiD WJB WB510089 product page","url":"https://www.carid.com/wjb/product-mpn-wb510089.html"},{"title":"The Wrench Monkey Mevotech H510089 cross-reference","url":"https://www.thewrenchmonkey.ca/brands/mevotech/h510089"}]',
 'Conservative catalog cross-reference. Other listings extend Civic coverage through 2018, but years/engine variants differ by source. Verify exact year/trim/engine and ABS configuration.'),
('WB510089','WJB','Front wheel bearing',2013,2014,'Acura','ILX','Front','North America',
 '[{"title":"The Wrench Monkey Mevotech H510089 cross-reference","url":"https://www.thewrenchmonkey.ca/brands/mevotech/h510089"},{"title":"FinditParts Mevotech H510089 cross-reference","url":"https://www.finditparts.com/products/9287936/mevotech-h510089"}]',
 'Cross-reference only; the available evidence links WJB WB510089 through Mevotech H510089. Confirm exact engine/trim and ABS configuration before calling it a match.')
) as v(part_number,brand,part_name,year_start,year_end,make,model,axle,market,evidence,notes)
where not exists (
 select 1 from public.fitment_applications f
 where lower(f.part_number)=lower(v.part_number)
 and lower(coalesce(f.make,''))=lower(v.make)
 and lower(coalesce(f.model,''))=lower(v.model)
 and f.vehicle_year_start is not distinct from v.year_start
 and f.vehicle_year_end is not distinct from v.year_end
);
 
-- Additional starter variety: WIX oil filters and FRAM oil filters.
-- Applications below are transcribed from the named filter manufacturers' published catalog listings.
insert into public.fitment_applications
(part_number,brand,part_name,vehicle_year_start,vehicle_year_end,make,model,engine,market,status,evidence,fitment_notes,reviewer,reviewed_at,source_checked_at)
select v.part_number,v.brand,v.part_name,v.year_start,v.year_end,v.make,v.model,v.engine,'North America','verified',v.evidence::jsonb,v.notes,'TORQWISE catalog review',now(),now()
from (values
('51348','WIX','Spin-on oil filter',2007,2010,'Ford','C-Max','1.8L Duratec','[{"title":"WIX 51348 official catalog application","url":"https://www.wixfilters.com/en-nz/catalog/results/product.html/51348_wix.html"}]','WIX catalog lists 1.8L Duratec C-Max applications from 05/2007 to 08/2010. Confirm market and engine code.'),
('51348','WIX','Spin-on oil filter',2014,null,'Ford','EcoSport','1.0L EcoBoost','[{"title":"WIX 51348 official catalog application","url":"https://www.wixfilters.com/en-nz/catalog/results/product.html/51348_wix.html"}]','WIX catalog lists 1.0L EcoBoost applications from 01/2014 onward in that catalog region. Verify model year and market-specific engine configuration.'),
('51348','WIX','Spin-on oil filter',2007,2014,'Toyota','Corolla','1.4L D-4D 1ND-TV','[{"title":"WIX 51348 official catalog application","url":"https://www.wixfilters.com/en-nz/catalog/results/product.html/51348_wix.html"}]','WIX catalog lists Corolla 1.4 D-4D with 1ND-TV for 04/2007–07/2014. Regional catalog coverage may differ.'),
('51348','WIX','Spin-on oil filter',1982,1993,'Toyota','Pickup','2.4L 22R','[{"title":"WIX 51348 official catalog application","url":"https://www.wixfilters.com/en-au/catalog/results/product.html/51348_wix.html"}]','Catalog lists engine code 22R for 04/1982–03/1993. Confirm exact vehicle naming, market and engine before order.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',1971,1971,'Mazda','616','1.6L','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM lists 1971 Mazda 616 with 1.6L engine. Confirm exact market and engine.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',1971,1971,'Mazda','R100','1.1L rotary','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM lists 1971 Mazda R100 with 1.1L engine. Confirm engine configuration.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',1972,1973,'Mazda','RX-2','1.1L rotary','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM application list includes 1972–1973 RX-2 with 1.1L rotary engine.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',1972,1975,'Mazda','RX-3','1.1L rotary','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM application list includes RX-3 model years shown for 1972–1975 with 1.1L rotary engine.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',1974,1975,'Mazda','RX-4','1.3L rotary','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM lists 1974–1975 RX-4 with 1.3L engine. Confirm market and exact variant.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',1972,1972,'Mazda','B1600','1.6L','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM lists 1972 B1600 with 1.6L engine. Confirm exact market and engine.')
) as v(part_number,brand,part_name,year_start,year_end,make,model,engine,evidence,notes)
where not exists (
 select 1 from public.fitment_applications f
 where lower(f.part_number)=lower(v.part_number)
 and lower(coalesce(f.make,''))=lower(v.make)
 and lower(coalesce(f.model,''))=lower(v.model)
 and f.vehicle_year_start is not distinct from v.year_start
 and f.vehicle_year_end is not distinct from v.year_end
);

 
-- Expanded WIX 51348 and FRAM PH7317 catalog applications.
-- Evidence links are manufacturer-published fitment catalogs/bulletins.
insert into public.fitment_applications
(part_number,brand,part_name,vehicle_year_start,vehicle_year_end,make,model,engine,market,status,evidence,fitment_notes,reviewer,reviewed_at,source_checked_at)
select v.part_number,v.brand,v.part_name,v.year_start,v.year_end,v.make,v.model,v.engine,'North America','verified',v.evidence::jsonb,v.notes,'TORQWISE catalog review',now(),now()
from (values
('51348','WIX','Spin-on oil filter',2019,2024,'Ford','Ranger','2.3L EcoBoost','[{"title":"WIX technical bulletin: Ford 2.0L/2.3L oil filter applications","url":"https://www.wixfilters.com/content/dam/website/wix/technical-bulletins/MH_WIX_ProTec_ProductBulletin_Ford%202pt0and2pt3LiterEngine_OilFilterFitment.pdf"}]','WIX technical bulletin lists 2019–2024 Ranger 2.3L with 51348/PXL51348. Confirm exact engine and market.'),
('51348','WIX','Spin-on oil filter',2019,2023,'Ford','Mustang','2.3L EcoBoost','[{"title":"WIX technical bulletin: Ford 2.0L/2.3L oil filter applications","url":"https://www.wixfilters.com/content/dam/website/wix/technical-bulletins/MH_WIX_ProTec_ProductBulletin_Ford%202pt0and2pt3LiterEngine_OilFilterFitment.pdf"}]','WIX technical bulletin lists 2019–2023 Mustang 2.3L with 51348/PXL51348. Confirm exact engine and market.'),
('51348','WIX','Spin-on oil filter',2022,2024,'Ford','Maverick','2.0L EcoBoost','[{"title":"WIX technical bulletin: Ford 2.0L/2.3L oil filter applications","url":"https://www.wixfilters.com/content/dam/website/wix/technical-bulletins/MH_WIX_ProTec_ProductBulletin_Ford%202pt0and2pt3LiterEngine_OilFilterFitment.pdf"}]','WIX technical bulletin lists 2022–2024 Maverick 2.0L with 51348/PXL51348. Confirm exact engine and market.'),
('51348','WIX','Spin-on oil filter',2019,2023,'Ford','Transit Connect','2.0L','[{"title":"WIX technical bulletin: Ford 2.0L/2.3L oil filter applications","url":"https://www.wixfilters.com/content/dam/website/wix/technical-bulletins/MH_WIX_ProTec_ProductBulletin_Ford%202pt0and2pt3LiterEngine_OilFilterFitment.pdf"}]','WIX technical bulletin lists 2019–2023 Transit Connect 2.0L with 51348/PXL51348. Confirm exact engine and market.'),
('51348','WIX','Spin-on oil filter',2020,2022,'Lincoln','Corsair','2.0L / 2.3L','[{"title":"WIX technical bulletin: Ford 2.0L/2.3L oil filter applications","url":"https://www.wixfilters.com/content/dam/website/wix/technical-bulletins/MH_WIX_ProTec_ProductBulletin_Ford%202pt0and2pt3LiterEngine_OilFilterFitment.pdf"}]','WIX technical bulletin lists 2020–2022 Corsair 2.0L and 2.3L with 51348/PXL51348. Confirm exact engine and market.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',2000,2000,'Honda','CR-V','2.0L','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM application list includes 2000 Honda CR-V 2.0L. Confirm exact engine and market.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',2000,2000,'Nissan','Altima','2.4L','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM application list includes 2000 Nissan Altima 2.4L. Confirm exact engine and market.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',2001,2001,'Honda','Accord','2.3L','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM application list includes 2001 Honda Accord 2.3L. Confirm exact engine and market.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',2001,2001,'Acura','EL','1.7L','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM application list includes 2001 Acura EL 1.7L. Confirm exact engine and market.'),
('PH7317','FRAM','Extra Guard spin-on oil filter',2001,2001,'Acura','Integra','1.8L','[{"title":"FRAM PH7317 official application list","url":"https://www.fram.com/fram-extra-guard-oil-filter-spin-on-ph7317"}]','FRAM application list includes 2001 Acura Integra 1.8L. Confirm exact engine and market.')
) as v(part_number,brand,part_name,year_start,year_end,make,model,engine,evidence,notes)
where not exists (
 select 1 from public.fitment_applications f
 where lower(f.part_number)=lower(v.part_number)
 and lower(coalesce(f.make,''))=lower(v.make)
 and lower(coalesce(f.model,''))=lower(v.model)
 and f.vehicle_year_start is not distinct from v.year_start
 and f.vehicle_year_end is not distinct from v.year_end
);
