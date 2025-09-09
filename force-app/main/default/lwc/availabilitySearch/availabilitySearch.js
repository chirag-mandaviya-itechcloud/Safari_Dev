import { LightningElement, track, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { getPicklistValues } from 'lightning/uiObjectInfoApi';
import getOptions from '@salesforce/apex/AvailabilitySearchController.getOptions';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getOptByOptCode from '@salesforce/apex/HotelController.getOptByOptCode';
import getLocationOptions from '@salesforce/apex/AvailabilitySearchController.getLocationOptions';
import getSelectedLocationsWithCodes from '@salesforce/apex/AvailabilitySearchController.getSelectedLocationsWithCodes';
import getHotelsFromLocations from '@salesforce/apex/AvailabilitySearchController.getHotelsFromLocations';
import SaveQuoteLineItem from '@salesforce/apex/QuoteLineItemController.saveQuoteLineItem';
import getPassengerTypeCounts from '@salesforce/apex/HotelController.getPassengerTypeCounts';
import ACCOUNT_OBJECT from '@salesforce/schema/Account';
import ATTRACTIONS_FIELD from '@salesforce/schema/Account.Supplier_Activities_Attractions__c';
import getTravelDatesFromQuote from '@salesforce/apex/AvailabilitySearchController.getTravelDatesFromQuote';

const CURRENCY = 'ZAR'; // API returns ZAR in your sample

export default class AvailabilitySearch extends LightningElement {
    @track filters = {
        serviceType: 'AC',
        startDate: '',
        durationNights: '1',
        endDate: '',
        quantityRooms: '1',
        location: '',
        starRating: '',
        supplierStatus: '',
        attractions: '',
        liveAvailability: 'OK',
        supplierName: ''
    };

    selectedLocations = [];
    selectableHotels = [];
    selectedSuppliers = [];
    selectedSupplierCrmCodes = [];
    selectedStarRatings = [];
    selectedSupplierStatuses = [];
    selectedAttractions = [];

    starOptions = [
        // { label: 'Any', value: ' ' },
        { label: '5 Star', value: '5 Star' },
        { label: '4 Star', value: '4 Star' },
        { label: '3 Star', value: '3 Star' }
    ];

    supplierStatusOptions = [
        // { label: 'Any', value: ' ' },
        { label: 'Super Preferred', value: 'Super Preferred' },
        { label: 'Preferred', value: 'PF' },
        { label: 'Standard', value: 'Standard' },
        { label: 'Blacklisted', value: 'Blacklisted' }
    ];

    @api recordId;

    // flat rows (if you still need them) and grouped view used by UI
    @track rows = [];
    @track groups = []; // [{ crmCode, supplier, items: [...] }]
    @track locationOptions = [];

    @track loading = false;
    error;
    adults = 0;
    children = 0;
    infants = 0;
    @track loadLoc = false;
    @track loadAttractions = false;
    @track supplierRecordTypeId;
    @track attractionsOptions = [];

    @track groupEdits = {};      // { [crmCode]: {startDate, durationNights, endDate, quantityRooms, starRating} }
    lastSelectedLocationCodes = []; // set after the main search
    @track starHeaderOptions = [];
    @track selectedKeys = {}; // { [selKey]: true }

    connectedCallback() {
        this.loadLocationOptions();
        this.loadPassengerCounts();
        this.loadTravelDates();
        this.starHeaderOptions = [...(this.starOptions || [])];
    }

    // 1. Get default record type Id for the object
    @wire(getObjectInfo, { objectApiName: ACCOUNT_OBJECT })
    accountMetadata({ data, error }) {
        if (data) {
            const recordTypeInfos = data.recordTypeInfos;
            // loop through recordTypeInfos to find Supplier
            for (let rtId in recordTypeInfos) {
                if (recordTypeInfos[rtId].name === 'Supplier') {
                    this.supplierRecordTypeId = rtId;
                    break;
                }
            }
            console.log('Supplier RecordTypeId:', this.supplierRecordTypeId);
        } else if (error) {
            console.error('Error fetching Account object info: ', error);
        }
    }

    // 2. Get picklist values for the field and record type
    @wire(getPicklistValues, {
        recordTypeId: '$supplierRecordTypeId',
        fieldApiName: ATTRACTIONS_FIELD
    })
    attractionsPicklistValues({ data, error }) {
        if (data) {
            // console.log('Attractions Picklist Data:', data);
            this.attractionsOptions = data.values.map(v => ({ label: v.label, value: v.value }));
            // console.log('Attractions Options:', this.attractionsOptions);
            this.loadAttractions = true;
        } else if (error) {
            console.error('Error fetching attractions picklist values: ', error);
        }
    }

    renderedCallback() {
        var locationComponent = this.template.querySelector('[role="cm-picklist"]');
        if (locationComponent != null && this.loadLoc) {
            locationComponent.setOptions(this.locationOptions);
            // locationComponent.setSelectedList('Other');
            if (this.selectedLocations.length > 0) {
                locationComponent.setSelectedList(this.selectedLocations?.map(l => l.label).join(';'));
            }

        }

        var starComponent = this.template.querySelector('[role="star-picklist"]');
        if (starComponent != null) {
            starComponent.setOptions(this.starOptions);
            if (this.selectedStarRatings.length > 0) {
                starComponent.setSelectedList(this.selectedStarRatings.join(';'));
            }
        }

        var statusComponent = this.template.querySelector('[role="status-picklist"]');
        if (statusComponent != null) {
            statusComponent.setOptions(this.supplierStatusOptions);
            // Optionally preselect
            if (this.selectedSupplierStatuses.length > 0) {
                statusComponent.setSelectedList(this.selectedSupplierStatuses.join(';'));
            }
        }

        var attractionsComponent = this.template.querySelector('[role="attractions-picklist"]');
        if (attractionsComponent != null && this.loadAttractions) {
            attractionsComponent.setOptions(this.attractionsOptions);
            // Optionally restore preselected ones:
            if (this.selectedAttractions.length > 0) {
                attractionsComponent.setSelectedList(this.selectedAttractions.join(';'));
            }
        }
    }

    loadLocationOptions() {
        this.loading = true;
        getLocationOptions().then((options) => {
            this.locationOptions = (options || [])
                .map(o => ({ label: o.label, value: o.value }))
                .sort((a, b) => a.label.localeCompare(b.label));
            console.log('locationOptions:', this.locationOptions);
            this.loadLoc = true;
        }).catch((e) => {
            console.error(`${e}`);
        }).finally(() => {
            this.loading = false;
        });
    }

    loadPassengerCounts() {
        this.loading = true;
        getPassengerTypeCounts({ quoteId: this.recordId }).then((counts) => {
            console.log('Passenger counts:', counts);
            this.adults = counts.Adult || 0;
            this.children = counts.Child || 0;
            this.infants = counts.Infant || 0;
        }).catch((e) => {
            console.error(`${e}`);
        }).finally(() => {
            this.loading = false;
        });
    }

    loadTravelDates() {
        this.loading = true;
        getTravelDatesFromQuote({ quoteId: this.recordId }).then((data) => {
            console.log('Travel Dates from Quote:', data);
            this.filters.startDate = data.startDate;
            this.filters.durationNights = String(data.durationNights);
            this.filters.endDate = this.computeEndDate(this.filters.startDate, this.filters.durationNights);
        }).catch((e) => {
            console.error(`${e}`);
        }).finally(() => {
            this.loading = false;
        });
    }

    // ----- Combobox options (match the screenshot) -----
    get serviceTypeOptions() {
        return [
            { label: 'Accommodation', value: 'AC' },
            { label: 'Transfer', value: 'TF' },
            { label: 'Day Tours', value: 'DT' },
            { label: 'Overland Tours', value: 'OV' },
            { label: 'Short-break Packages', value: 'PK' },
        ];
    }
    get durationOptions() {
        return Array.from({ length: 30 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }));
    }
    get roomQtyOptions() {
        return Array.from({ length: 9 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }));
    }
    get liveAvailOptions() {
        return [
            { label: 'Available', value: 'OK' },
            { label: 'On Request', value: 'RQ' },
        ];
    }

    get selectedCount() {
        return Object.keys(this.selectedKeys).filter(k => this.selectedKeys[k]).length;
    }
    get hasSelection() { return this.selectedCount > 0; }
    get disableSave() { return !this.hasSelection; }

    computeSelectClass(isSelected) {
        return `select-button${isSelected ? ' selected' : ''}`;
    }


    handleInput = (e) => {
        const { name, value } = e.target;
        console.log(`Changed ${name} : ${value}`);

        // First, update the changed field
        let next = { ...this.filters, [name]: value };

        // Special handling for location (you already had this)
        if (name === 'locationCode') {
            const picked = this.locationOptions.find(o => o.value === value);
            next.location = picked?.label || '';
        }

        // Recompute end date when start or nights change
        if (name === 'startDate' || name === 'durationNights') {
            next.endDate = this.computeEndDate(next.startDate, next.durationNights);
        }

        this.filters = next;
    };

    computeEndDate(startIso, nights) {
        if (!startIso) return '';
        const n = parseInt(nights, 10);
        const nightsInt = Number.isFinite(n) ? n : 0;

        // End date = start + nights + 1 day (your requirement)
        const d = new Date(`${startIso}T00:00:00`); // anchor to midnight to avoid TZ surprises
        d.setDate(d.getDate() + nightsInt + 1);

        return d.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    async handleSearch() {
        this.loading = true;
        this.error = undefined;

        // ---- Required field validation ----
        const requiredFields = [
            { key: 'serviceType', label: 'Service Type' },
            { key: 'startDate', label: 'Start Date' },
            { key: 'durationNights', label: 'Duration (Nights)' },
            { key: 'quantityRooms', label: 'Quantity (Rooms)' },
        ];
        const missing = requiredFields.filter(f => !this.filters[f.key]);
        const noLocation = !this.selectedLocations || this.selectedLocations.length === 0;

        if (missing.length || noLocation) {
            const fieldNames = missing.map(f => f.label);
            if (noLocation) fieldNames.push('Location');
            this.showToast('Missing Required Fields', `Please fill in: ${fieldNames.join(', ')}`, 'error');
            this.loading = false;
            return;
        }

        try {
            // 1) Resolve location codes for *this* search
            const locationData = await getSelectedLocationsWithCodes({
                locationIds: this.selectedLocations.map(l => l.value),
            });
            const newLocCodes = (locationData || []).map(l => l.LOC_Name__c);

            // Keep a union with any previously searched locations
            const locUnion = new Set([...(this.lastSelectedLocationCodes || []), ...newLocCodes]);
            this.lastSelectedLocationCodes = Array.from(locUnion);

            // 2) Build payloads
            const payloads = [];
            const hotelCrmCodes =
                (this.selectedSupplierCrmCodes && this.selectedSupplierCrmCodes.length > 0)
                    ? this.selectedSupplierCrmCodes
                    : [null];

            locationData.forEach(loc => {
                const locationCode = loc.LOC_Name__c;
                hotelCrmCodes.forEach(crmCode => {
                    const opt = crmCode
                        ? `${locationCode}${this.filters.serviceType}${crmCode}??????`
                        : `${locationCode}${this.filters.serviceType}????????????`;

                    const roomQty = parseInt(this.filters.quantityRooms, 10) || 1;
                    const roomConfigs = Array.from({ length: roomQty }, () => ({
                        RoomConfig: { Children: this.children, Adults: this.adults, Infants: this.infants }
                    }));

                    payloads.push({
                        Opt: opt,
                        Info: 'GSI',
                        DateFrom: this.filters.startDate,
                        SCUqty: this.filters.durationNights,
                        ButtonName: 'Accommodation',
                        RoomConfigs: roomConfigs,
                        MaximumOptions: 30
                    });
                });
            });

            const requestPayload = { records: payloads };
            const body = await getOptions({ reqPayload: JSON.stringify(requestPayload) });
            const raw = (typeof body === 'string') ? JSON.parse(body) : body;

            // 3) Transform only the newly fetched results
            const fetchedRows = this.transformApiData(raw);

            // 4) Apply top-level filters to the *new* rows
            const live = this.filters.liveAvailability;
            let filtered = fetchedRows.filter(r => {
                if (live === 'OK') return r.status === 'Available';
                if (live === 'RQ') return r.status === 'On Request';
                return true;
            });

            if (this.selectedStarRatings && this.selectedStarRatings.length > 0) {
                filtered = filtered.filter(row =>
                    this.selectedStarRatings.some(sel =>
                        row.starRating && row.starRating.toLowerCase().includes(sel.toLowerCase())
                    )
                );
            }

            if (this.selectedSupplierStatuses && this.selectedSupplierStatuses.length > 0) {
                filtered = filtered.filter(r => this.selectedSupplierStatuses.includes(r.supplierStatus));
            }

            // 5) Normalize new rows: unique id + preserve selection state
            const ts = Date.now();
            const normalizedNew = filtered.map((r, i) => {
                const selected = !!this.selectedKeys[r.selKey];
                return {
                    ...r,
                    id: `${r.selKey}-${ts}-${i}`,
                    isSelected: selected,
                    selectButtonClass: this.computeSelectClass(selected),
                };
            });

            // 6) Merge with existing rows by selKey (skip duplicates)
            const existingBySelKey = new Map((this.rows || []).map(r => [r.selKey, r]));
            for (const nr of normalizedNew) {
                if (!existingBySelKey.has(nr.selKey)) {
                    existingBySelKey.set(nr.selKey, nr);
                }
                // If you prefer to *replace* duplicates with fresher data, use:
                // existingBySelKey.set(nr.selKey, nr);
            }
            const mergedRows = Array.from(existingBySelKey.values());

            // 7) Save and regroup (this appends new hotels without losing existing ones)
            this.rows = mergedRows;
            this.groups = this.groupBySupplier(mergedRows);

        } catch (err) {
            this.error = (err && err.body && err.body.message)
                ? err.body.message
                : (err?.message || 'Unexpected error');
        } finally {
            this.loading = false;
            this.hasSearched = true;
        }
    }

    transformApiData(apiPayload) {
        const payload = (typeof apiPayload === 'string') ? JSON.parse(apiPayload) : apiPayload;

        // Extract the array of option objects regardless of nesting style
        let options = [];
        if (Array.isArray(payload?.result)) {
            options = payload.result.flatMap(x => Array.isArray(x) ? x : [x]);
        } else if (Array.isArray(payload) && payload[0]?.result) {
            const r = payload[0].result;
            options = Array.isArray(r) ? r.flatMap(x => Array.isArray(x) ? x : [x]) : [];
        }

        const out = [];
        options.forEach((opt) => {
            const gen = opt?.OptGeneral || {};
            const supplier = gen?.SupplierName || '';
            const desc = gen?.Description || '';
            const locality = gen?.LocalityDescription || gen?.Locality || '';
            const childPolicy = this.composeChildPolicy(gen);
            const supplierStatus = gen?.DBAnalysisCode1 || '';
            const starRating = gen?.ClassDescription || '';

            const optMeta = {
                optId: opt?.Opt || '',
                optionNumber: opt?.OptionNumber || ''
            };

            const rawStay = opt?.OptStayResults;
            const stays = Array.isArray(rawStay) ? rawStay : (rawStay ? [rawStay] : []);

            stays.forEach((stay, idx) => {
                const row = this.mapStayToRow(stay, supplier, desc, locality, childPolicy, optMeta, supplierStatus, starRating);
                out.push({ ...row, id: `${optMeta.optionNumber || optMeta.optId}-${idx}` });
            });
        });

        // stable numeric ids if you prefer
        // return out.map((r, i) => ({ ...r, id: String(i) }));
        return out;
    }

    mapStayToRow(stay, supplier, desc, locality, childPolicy, optMeta = { optId: '', optionNumber: '' }, supplierStatus, starRating) {
        const availabilityCode = (stay?.Availability || '').toUpperCase();
        const statusMap = { OK: 'Available', RQ: 'On Request', NO: 'Unavailable', NA: 'Unavailable' };
        const status = statusMap[availabilityCode] || (availabilityCode || '—');

        const nett = this.formatMoney(stay?.AgentPrice ?? stay?.TotalPrice);
        const sell = this.formatMoney(stay?.TotalPrice ?? stay?.AgentPrice);

        const rateText =
            (typeof stay?.RateText === 'string' && stay.RateText) ||
            (stay?.ExternalRateDetails?.ExtRatePlanDescr) ||
            '';

        const externalDescr = stay?.ExternalRateDetails?.ExtOptionDescr || '';
        const roomType = stay?.RoomList?.RoomType || 'TWIN AVAIL';
        const crmCode = this.extractCrm(optMeta.optId);
        const rateId = stay?.RateId || '';
        const selKey = `${optMeta.optId}#${rateId}`;   // << stable selection key
        const selected = !!this.selectedKeys[selKey];

        return {
            service: `${desc} - ${supplier}${locality ? ` (${locality})` : ''}`,
            rateCategory: externalDescr
                ? (typeof stay?.RateName === 'string' && stay.RateName ? stay.RateName : 'Wholesale')
                : 'Contract net rate with breakfast',
            rateDescription: rateText || '—',
            childPolicy,
            supplier,
            inCancellation: this.cancelWindow(stay?.CancelHours),
            nett,
            sell,
            status,
            roomType,
            statusClass: `slds-truncate ${status === 'Available' ? 'slds-text-color_success'
                : status === 'On Request' ? 'slds-text-color_warning'
                    : 'slds-text-color_error'}`,
            addDisabled: (status === 'Unavailable'),
            optId: optMeta.optId,
            optionNumber: optMeta.optionNumber,
            rateId,
            crmCode,
            locality,
            supplierStatus,
            starRating,
            selKey,
            isSelected: selected,
            selectButtonClass: `select-button${selected ? ' selected' : ''}`,
        };
    }

    handleChangeLocation(event) {
        const selectedOptions = event.detail.options.filter(opt => opt.checked);
        const selectedLocs = selectedOptions.map(opt => ({ value: opt.value, label: opt.label }));
        this.selectedLocations = selectedLocs;
        console.log('Selected locations:', selectedLocs);
        this.getHotels();
    }

    async getHotels() {
        this.selectableHotels = await getHotelsFromLocations({ locationIds: this.selectedLocations.map(l => l.value) });
        console.log('Selectable Hotels:', this.selectableHotels);
        var supplierComponent = this.template.querySelector('[role="cms-picklist"]');
        if (supplierComponent != null) {
            supplierComponent.setOptions(this.selectableHotels);
        }
    }

    handleChangeSupplier(event) {
        const selectedSupplierOptions = event.detail.options.filter(opt => opt.checked);
        this.selectedSupplierCrmCodes = selectedSupplierOptions.map(opt => opt.value);
        const selectedSup = selectedSupplierOptions.map(opt => ({ value: opt.value, label: opt.label }));
        this.selectedSuppliers = selectedSup;
        console.log('Selected suppliers:', selectedSup);
    }

    handleChangeStarRating(event) {
        const selectedOptions = event.detail.options.filter(opt => opt.checked);
        this.selectedStarRatings = selectedOptions.map(opt => opt.value);
        console.log('Selected star ratings:', this.selectedStarRatings);
    }

    handleChangeSupplierStatus(event) {
        const selectedOptions = event.detail.options.filter(opt => opt.checked);
        this.selectedSupplierStatuses = selectedOptions.map(opt => opt.value);
        console.log('Selected supplier statuses:', this.selectedSupplierStatuses);
    }

    handleChangeAttractions(event) {
        const selectedOptions = event.detail.options.filter(opt => opt.checked);
        this.selectedAttractions = selectedOptions.map(opt => opt.value);
        console.log('Selected attractions:', this.selectedAttractions);
    }

    handleToggleSelect = (e) => {
        const rowKey = e.currentTarget.dataset.rowKey;
        const next = !this.selectedKeys[rowKey];
        this.selectedKeys = { ...this.selectedKeys, [rowKey]: next };
        const cls = this.computeSelectClass(next);

        this.rows = (this.rows || []).map(r =>
            r.selKey === rowKey ? { ...r, isSelected: next, selectButtonClass: cls } : r
        );
        this.groups = (this.groups || []).map(g => ({
            ...g,
            items: g.items.map(it =>
                it.selKey === rowKey ? { ...it, isSelected: next, selectButtonClass: cls } : it
            )
        }));
    };

    handleClearSelection = () => {
        this.selectedKeys = {};
        this.rows = (this.rows || []).map(r => ({
            ...r,
            isSelected: false,
            selectButtonClass: this.computeSelectClass(false) // <- resets color
        }));
        this.groups = (this.groups || []).map(g => ({
            ...g,
            items: g.items.map(it => ({
                ...it,
                isSelected: false,
                selectButtonClass: this.computeSelectClass(false) // <- resets color
            }))
        }));
    };

    extractCrm(optId) {
        // example: NTYACCAB001SSTAFB -> CAB001 from positions 6..11 (0-based 5..10)
        if (!optId || optId.length < 11) return '';
        return optId.substring(5, 11);
    }

    // groupBySupplier(rows) {
    //     // Group on CRM code; carry first supplier name seen
    //     const map = new Map();
    //     rows.forEach(r => {
    //         const key = r.crmCode || '—';
    //         if (!map.has(key)) {
    //             map.set(key, { crmCode: key, supplier: r.supplier || '—', items: [] });
    //         }
    //         map.get(key).items.push(r);
    //     });

    //     // sort suppliers alphabetically; inside, sort by status then nett ascending
    //     const groups = Array.from(map.values())
    //         .sort((a, b) => a.supplier.localeCompare(b.supplier))
    //         .map(g => ({
    //             ...g,
    //             items: g.items.slice().sort((x, y) => {
    //                 const s = (x.status || '').localeCompare(y.status || '');
    //                 if (s !== 0) return s;
    //                 const nx = Number((x.nett || '').replace(/[^\d]/g, '')) || 0;
    //                 const ny = Number((y.nett || '').replace(/[^\d]/g, '')) || 0;
    //                 return nx - ny;
    //             }),
    //             firstLocality: g.items.length > 0 ? g.items[0].locality : ''
    //         }));

    //     return groups;
    // }
    groupBySupplier(rows) {
        const map = new Map();
        rows.forEach(r => {
            const key = r.crmCode || '—';
            if (!map.has(key)) {
                map.set(key, { crmCode: key, supplier: r.supplier || '—', items: [] });
            }
            map.get(key).items.push(r);
        });

        const sortItems = (arr) => arr.slice().sort((x, y) => {
            const s = (x.status || '').localeCompare(y.status || '');
            if (s !== 0) return s;
            const nx = Number((x.nett || '').replace(/[^\d]/g, '')) || 0;
            const ny = Number((y.nett || '').replace(/[^\d]/g, '')) || 0;
            return nx - ny;
        });

        // Build a quick map of previous loading states to preserve them
        const prevLoading = new Map((this.groups || []).map(g => [g.crmCode, !!g.loading]));

        const groups = Array.from(map.values())
            .sort((a, b) => a.supplier.localeCompare(b.supplier))
            .map(g => {
                const eff = this.getEffectiveGroupFilters ? this.getEffectiveGroupFilters(g.crmCode) : this.filters;
                return {
                    ...g,
                    items: sortItems(g.items),
                    firstLocality: g.items.length > 0 ? g.items[0].locality : '',
                    // per-hotel UI fields (keep if you already added them)
                    uiStartDate: eff.startDate || '',
                    uiEndDate: (eff.endDate || this.computeEndDate(eff.startDate, eff.durationNights)) || '',
                    uiDurationNights: String(eff.durationNights || '1'),
                    uiQuantityRooms: String(eff.quantityRooms || '1'),
                    uiStarRating: (this.groupEdits[g.crmCode]?.starRating ?? eff.starRating ?? ''),
                    // loading flag lives on each group
                    loading: prevLoading.get(g.crmCode) || false,
                };
            });

        return groups;
    }

    setGroupLoading(crmCode, value) {
        this.groups = this.groups.map(g =>
            g.crmCode === crmCode ? { ...g, loading: !!value } : g
        );
    }

    composeChildPolicy(gen) {
        const aFrom = gen?.Adult_From, aTo = gen?.Adult_To;
        const cFrom = gen?.Child_From, cTo = gen?.Child_To;
        const iFrom = gen?.Infant_From, iTo = gen?.Infant_To;
        const parts = [];
        if (aFrom || aTo) parts.push(`Adults: ${aFrom || '—'}-${aTo || '—'}`);
        if (cFrom || cTo) parts.push(`Child: ${cFrom || '—'}-${cTo || '—'}`);
        if (iFrom || iTo) parts.push(`Infant: ${iFrom || '—'}-${iTo || '—'}`);
        return parts.join(', ') || '—';
    }

    cancelWindow(hours) {
        if (!hours) return 'No';
        const h = Number(hours);
        if (Number.isFinite(h) && h > 0) return 'Yes';
        return 'No';
    }

    formatMoney(amount) {
        if (amount == null || amount === '') return '';
        const n = Number(amount);
        if (!Number.isFinite(n)) return '';
        const val = n / 100; // sample shows cents
        return `${CURRENCY}${val.toLocaleString()}`;
    }

    get showNoHotels() {
        return this.hasSearched && !this.loading && !this.error && (!this.groups || this.groups.length === 0);
    }

    async handleAdd(event) {

        const rowId = event.currentTarget.dataset.rowId;

        // find selected row from flattened rows
        const row = this.rows.find(r => r.id === rowId);
        if (!row) return;

        this.loading = true;
        // pull OPT record for create QuoteLineItem
        const selectedOPT = await getOptByOptCode({ optCode: row.optId });

        // build RoomConfigs array based on quantityRooms
        const roomQty = parseInt(this.filters.quantityRooms, 10) || 1;
        const roomConfigs = Array.from({ length: roomQty }, () => ({
            children: 0,
            adults: 2
        }));

        const roomConfigurations = roomConfigs.map((room, i) => ({
            id: i + 1,
            serviceType: 'Accommodation',
            serviceSubtype: row.roomType,
            adults: room.adults,
            children: room.children,
            infants: 0,
            passengers: room.adults + room.children + 0,
            quoteLineItemId: null,
            order: i + 1
        }));

        const params = {
            serviceLineItemName: row.supplier,
            selectedServiceType: selectedOPT[0].SRV_Name__c,
            selectedLocation: selectedOPT[0].LOC_Name__c,
            selectedSupplierName: row.supplier,
            selectedSupplierId: selectedOPT[0].CRM_Lookup__c,
            selectedServiceDetail: `${selectedOPT[0].Description__c} || ${selectedOPT[0].Comment__c}`,
            selectedServiceDetailDisplayName: `${selectedOPT[0].Description__c} || ${selectedOPT[0].Comment__c}`,
            quoteLineItemId: 'newitem',
            serviceClientNotes: '',
            serviceReservationNumber: '',
            serviceSelectServiceStatus: 'Not Booked',
            serviceExpiryDate: '',
            overrideDetails: false,
            overridenSupplierPolicy: true,
            selectedPassengers: [],
            serviceDate: this.filters.startDate,
            numberOfDays: this.filters.durationNights.toString(),
            displayDuration: this.filters.durationNights.toString(),
            quoteId: this.recordId,
            roomConfigurations: roomConfigurations,
            logistics: {},
            flightDetail: {},
            oldChargeTypes: [],
            keepRatesOnDateChange: true,
            selectedOPT: selectedOPT[0].ExternalId__c,
            addOns: [],
            serviceInclusionNote: '',
            serviceExclusionNote: '',
            supplierDescription: '',
            serviceDescription: ''
        };

        console.log("Final Params : ", params);

        try {
            const result = await SaveQuoteLineItem(params);
            console.log("Result: ", result);
            if (result.length === 0) {
                this.showToast('Success', 'QuoteLineItem Added Successfully.', 'success');
            } else {
                this.showToast('Error', 'Error occured while adding QuoteLineItem.', 'error');
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`Error saving for "${row.supplier}": `, error);
            this.showToast('Error', `Error occured while adding QuoteLineItem - ${error}`, 'error');
        } finally {
            this.loading = false;
        }
    }

    handleSaveSelected = async () => {
        // Collect selected, valid rows
        const selected = (this.rows || []).filter(
            r => !!this.selectedKeys[r.selKey] && !r.addDisabled
        );

        if (selected.length === 0) {
            this.showToast('Nothing to save', 'Please select one or more options first.', 'warning');
            return;
        }

        this.loading = true;

        // Helper for button class (keeps color in sync)
        const computeSelectClass = (isSelected) => `select-button${isSelected ? ' selected' : ''}`;

        let ok = 0;
        let fail = 0;
        const failedMsgs = [];

        try {
            // IMPORTANT: run **sequentially** to avoid row-locks on the same Quote
            for (const row of selected) {
                try {
                    // Per-hotel effective inputs (dates/rooms/nights)
                    const eff = this.getEffectiveGroupFilters(row.crmCode);

                    // Pull OPT for the row
                    const selectedOPT = await getOptByOptCode({ optCode: row.optId });
                    if (!selectedOPT || !selectedOPT[0]) {
                        throw new Error(`OPT not found for ${row.optId}`);
                    }

                    // Build room configs (keep your logic)
                    const roomQty = parseInt(eff.quantityRooms, 10) || 1;
                    const roomConfigs = Array.from({ length: roomQty }, () => ({ children: 0, adults: 2 }));
                    const roomConfigurations = roomConfigs.map((room, i) => ({
                        id: i + 1,
                        serviceType: 'Accommodation',
                        serviceSubtype: row.roomType,
                        adults: room.adults,
                        children: room.children,
                        infants: 0,
                        passengers: room.adults + room.children + 0,
                        quoteLineItemId: null,
                        order: i + 1
                    }));

                    // Params per your single-add flow
                    const params = {
                        serviceLineItemName: row.supplier,
                        selectedServiceType: selectedOPT[0].SRV_Name__c,
                        selectedLocation: selectedOPT[0].LOC_Name__c,
                        selectedSupplierName: row.supplier,
                        selectedSupplierId: selectedOPT[0].CRM_Lookup__c,
                        selectedServiceDetail: `${selectedOPT[0].Description__c} || ${selectedOPT[0].Comment__c}`,
                        selectedServiceDetailDisplayName: `${selectedOPT[0].Description__c} || ${selectedOPT[0].Comment__c}`,
                        quoteLineItemId: 'newitem',
                        serviceClientNotes: '',
                        serviceReservationNumber: '',
                        serviceSelectServiceStatus: 'Not Booked',
                        serviceExpiryDate: '',
                        overrideDetails: false,
                        overridenSupplierPolicy: true,
                        selectedPassengers: [],
                        serviceDate: eff.startDate,                    // per-hotel date
                        numberOfDays: String(eff.durationNights),      // per-hotel nights
                        displayDuration: String(eff.durationNights),
                        quoteId: this.recordId,
                        roomConfigurations,
                        logistics: {},
                        flightDetail: {},
                        oldChargeTypes: [],
                        keepRatesOnDateChange: true,
                        selectedOPT: selectedOPT[0].ExternalId__c,
                        addOns: [],
                        serviceInclusionNote: '',
                        serviceExclusionNote: '',
                        supplierDescription: '',
                        serviceDescription: ''
                    };

                    const result = await SaveQuoteLineItem(params);
                    // Your Apex returns [] on success
                    if (Array.isArray(result) && result.length === 0) {
                        ok += 1;

                        // Deselect this row in all places
                        const k = row.selKey;
                        const newSel = { ...this.selectedKeys };
                        delete newSel[k];
                        this.selectedKeys = newSel;

                        // Update flat rows
                        this.rows = (this.rows || []).map(r =>
                            r.selKey === k ? { ...r, isSelected: false, selectButtonClass: computeSelectClass(false) } : r
                        );
                        // Update grouped rows
                        this.groups = (this.groups || []).map(g => ({
                            ...g,
                            items: g.items.map(it =>
                                it.selKey === k ? { ...it, isSelected: false, selectButtonClass: computeSelectClass(false) } : it
                            )
                        }));
                    } else {
                        throw new Error(`SaveQuoteLineItem failed for ${row.supplier}`);
                    }
                } catch (errOne) {
                    fail += 1;
                    // Common parallel issue we’re avoiding: UNABLE_TO_LOCK_ROW
                    failedMsgs.push(errOne?.body?.message || errOne?.message || 'Unknown error');
                    // continue with next row
                }
            }

            if (ok > 0 && fail === 0) {
                this.showToast('Success', `Created ${ok} Quote Line Item(s).`, 'success');
            } else if (ok > 0 && fail > 0) {
                this.showToast('Partial success', `Created ${ok}. Failed ${fail}.`, 'warning');
                // Optional: log the first few failure messages
                console.warn('Failures:', failedMsgs.slice(0, 5));
            } else {
                this.showToast('Failed', `All ${fail} item(s) failed to save.`, 'error');
                console.error('Failures:', failedMsgs);
            }
        } finally {
            this.loading = false;
        }
    };

    // --- Pretty header values (used in the group header) ---
    get headerCheckIn() {
        return this.formatDatePretty(this.filters.startDate);
    }
    get headerCheckOut() {
        if (this.filters.endDate) return this.formatDatePretty(this.filters.endDate);
        if (!this.filters.startDate) return '—';
        // Fallback: compute on the fly using nights + 1
        return this.formatDatePretty(
            this.computeEndDate(this.filters.startDate, this.filters.durationNights)
        );
    }
    get headerNights() {
        const n = this.filters.durationNights || '0';
        return `${n} (Nights)`;
    }
    get headerRooms() {
        const r = this.filters.quantityRooms || '0';
        return `${r} (Rooms)`;
    }
    get headerLocation() {
        return this.filters.location || '—';
    }
    get headerSupplierStatus() {
        // human-friendly label from filter (fallback to em dash)
        // const m = { '': 'Any', PF: 'Preferred', PP: 'Pre-paid / Voucher' };
        // return m[this.filters.supplierStatus ?? ''] || '—';
        if (!this.selectedSupplierStatuses || this.selectedSupplierStatuses.length === 0) {
            return 'Any';
        }
        return this.selectedSupplierStatuses.join(', ');
    }

    get headerStarRating() {
        const r = { '': 'Any', '5 Star': '5 Star', '4 Star': '4 Star', '3 Star': '3 Star' }
        return r[this.filters.starRating ?? ''] || '-';
    }

    // date formatting used by header
    formatDatePretty(isoLike) {
        if (!isoLike) return '—';
        const d = new Date(isoLike);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); // e.g., 1 May 2025
    }

    getEffectiveGroupFilters(crmCode) {
        const base = this.filters;
        const ov = this.groupEdits[crmCode] || {};
        const merged = { ...base, ...ov };
        merged.endDate = merged.endDate || this.computeEndDate(merged.startDate, merged.durationNights);
        return merged;
    }

    handleGroupHeaderChange = (e) => {
        const crm = e.currentTarget.dataset.crm;
        const { name, value } = e.target;

        const prev = this.groupEdits[crm] || {};
        const next = { ...prev, [name]: value };

        if (name === 'startDate' || name === 'durationNights') {
            const start = next.startDate ?? this.filters.startDate;
            const nights = next.durationNights ?? this.filters.durationNights;
            next.endDate = this.computeEndDate(start, nights);
        }

        this.groupEdits = { ...this.groupEdits, [crm]: next };

        // Refresh UI fields only for this group (cheap in-place update)
        this.groups = this.groups.map(g => {
            if (g.crmCode !== crm) return g;
            const eff = this.getEffectiveGroupFilters(crm);
            return {
                ...g,
                uiStartDate: eff.startDate || '',
                uiEndDate: eff.endDate || '',
                uiDurationNights: String(eff.durationNights || '1'),
                uiQuantityRooms: String(eff.quantityRooms || '1'),
                uiStarRating: eff.starRating || ''
            };
        });
    };

    get headerText() {
        let parts = [];

        if (this.adults > 0) {
            parts.push(`${this.adults} Adult${this.adults > 1 ? 's' : ''}`);
        }
        if (this.children > 0) {
            parts.push(`${this.children} Children${this.children > 1 ? 'ren' : ''}`);
        }
        if (this.infants > 0) {
            parts.push(`${this.infants} Infant${this.infants > 1 ? 's' : ''}`);
        }

        if (parts.length === 0) {
            return 'Availability Search';
        }

        return `Availability Search for ${parts.join(' and ')}`;
    }

    handleGroupSearch = async (e) => {
        const crm = e.currentTarget.dataset.crm;
        if (!crm) return;

        // Helper to flip loading on this specific group (no computed access in template)
        const setLoading = (val) => {
            this.groups = (this.groups || []).map(g =>
                g.crmCode === crm ? { ...g, loading: !!val } : g
            );
        };

        setLoading(true);

        try {
            // 1) Effective inputs for THIS group (group overrides -> fallback to top)
            const overrides = (this.groupEdits && this.groupEdits[crm]) ? this.groupEdits[crm] : {};
            const eff = { ...this.filters, ...overrides };
            eff.endDate =
                eff.endDate ||
                this.computeEndDate(eff.startDate, eff.durationNights);

            // 2) Locations to search: reuse from the last main search, or fetch now
            let locationCodes = Array.isArray(this.lastSelectedLocationCodes)
                ? this.lastSelectedLocationCodes
                : [];

            if (!locationCodes || locationCodes.length === 0) {
                const locs = await getSelectedLocationsWithCodes({
                    locationIds: (this.selectedLocations || []).map(l => l.value)
                });
                locationCodes = (locs || []).map(l => l.LOC_Name__c);
                this.lastSelectedLocationCodes = locationCodes; // cache for future per-group searches
            }

            // 3) Build per-group payload (only this CRM, across the chosen locations)
            const roomQty = parseInt(eff.quantityRooms, 10) || 1;
            const roomConfigs = Array.from({ length: roomQty }, () => ({
                RoomConfig: { Children: this.children, Adults: this.adults, Infants: this.infants }
            }));

            const records = locationCodes.map(locCode => ({
                Opt: `${locCode}${eff.serviceType}${crm}??????`,
                Info: 'GSI',
                DateFrom: eff.startDate,
                SCUqty: eff.durationNights,
                ButtonName: 'Accommodation',
                RoomConfigs: roomConfigs,
                MaximumOptions: 30
            }));

            console.log('Per-group payload:', { records });

            const body = await getOptions({ reqPayload: JSON.stringify({ records }) });
            const raw = (typeof body === 'string') ? JSON.parse(body) : body;

            // 4) Transform + FILTER rows for THIS CRM only
            const allNewRows = this.transformApiData(raw);
            let newRows = allNewRows.filter(r => r.crmCode === crm);

            // Live availability (top control)
            if (this.filters.liveAvailability === 'OK') {
                newRows = newRows.filter(r => r.status === 'Available');
            } else if (this.filters.liveAvailability === 'RQ') {
                newRows = newRows.filter(r => r.status === 'On Request');
            }

            // Star rating: prefer group override; else top multi-select
            const groupStar = (overrides.starRating || '').trim();
            const starsToFilter = groupStar ? [groupStar] : this.selectedStarRatings;
            if (starsToFilter && starsToFilter.length > 0) {
                newRows = newRows.filter(row =>
                    starsToFilter.some(s =>
                        row.starRating && row.starRating.toLowerCase().includes(s.toLowerCase())
                    )
                );
            }

            // Supplier status (top multi-select)
            if (this.selectedSupplierStatuses && this.selectedSupplierStatuses.length > 0) {
                newRows = newRows.filter(r => this.selectedSupplierStatuses.includes(r.supplierStatus));
            }

            newRows = newRows.map(r => ({ ...r, isSelected: !!this.selectedKeys[r.selKey] }));

            // 5) Replace ONLY this group's items; keep others intact
            const sortItems = (arr) => arr.slice().sort((x, y) => {
                const s = (x.status || '').localeCompare(y.status || '');
                if (s !== 0) return s;
                const nx = Number((x.nett || '').replace(/[^\d]/g, '')) || 0;
                const ny = Number((y.nett || '').replace(/[^\d]/g, '')) || 0;
                return nx - ny;
            });

            this.groups = (this.groups || []).map(g => {
                if (g.crmCode !== crm) return g;
                const sorted = sortItems(newRows);
                return {
                    ...g,
                    items: sorted,
                    firstLocality: sorted.length > 0 ? sorted[0].locality : g.firstLocality
                    // keep uiStartDate/uiEndDate/uiDurationNights/uiQuantityRooms/uiStarRating as they already reflect edits
                };
            });

            // 6) Keep flat rows in sync so "Add" buttons continue to work
            const others = (this.rows || []).filter(r => r.crmCode !== crm);
            const ts = Date.now();
            const refreshedRows = newRows.map((r, i) => ({ ...r, id: `${crm}-${i}-${ts}` }));
            this.rows = [...others, ...refreshedRows];

        } catch (err) {
            const msg = (err && err.body && err.body.message) ? err.body.message : (err?.message || 'Unexpected error');
            this.showToast('Error', msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
