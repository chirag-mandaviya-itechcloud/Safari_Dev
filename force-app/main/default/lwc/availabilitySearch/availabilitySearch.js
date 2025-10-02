import { LightningElement, track, api, wire } from 'lwc';
import { subscribe, unsubscribe, onError, setDebugFlag } from 'lightning/empApi';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { getPicklistValues } from 'lightning/uiObjectInfoApi';
import getOptions from '@salesforce/apex/AvailabilitySearchController.getOptions';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getOptByOptCode from '@salesforce/apex/HotelController.getOptByOptCode';
import getLocationOptions from '@salesforce/apex/AvailabilitySearchController.getLocationOptions';
import getSelectedLocationsWithCodes from '@salesforce/apex/AvailabilitySearchController.getSelectedLocationsWithCodes';
import getFerretDestinationFromCrmCode from '@salesforce/apex/AvailabilitySearchController.getFerretDestinationFromCrmCode';
import getOptsExternalIds from '@salesforce/apex/AvailabilitySearchController.getOptsExternalIds';
import getHotelsFromLocations from '@salesforce/apex/AvailabilitySearchController.getHotelsFromLocations';
import SaveQuoteLineItem from '@salesforce/apex/QuoteLineItemController.saveQuoteLineItem';
import getPassengerTypeCounts from '@salesforce/apex/HotelController.getPassengerTypeCounts';
import ACCOUNT_OBJECT from '@salesforce/schema/Account';
import ATTRACTIONS_FIELD from '@salesforce/schema/Account.Supplier_Activities_Attractions__c';
import getTravelDatesFromQuote from '@salesforce/apex/AvailabilitySearchController.getTravelDatesFromQuote';
import getAllCurrencyMapByBaseCurrency from '@salesforce/apex/AvailabilitySearchController.getAllCurrencyMapByBaseCurrency';
import getQuoteDetails from '@salesforce/apex/AvailabilitySearchController.getQuoteDetails';
import getCountryMarkups from '@salesforce/apex/AvailabilitySearchController.getCountryMarkups';
import getServiceTypeMarkups from '@salesforce/apex/AvailabilitySearchController.getServiceTypeMarkups';
import getSupplierMarkups from '@salesforce/apex/AvailabilitySearchController.getSupplierMarkups';
import getSupplierNamesByCrmCodes from '@salesforce/apex/AvailabilitySearchController.getSupplierNamesByCrmCodes';

export default class AvailabilitySearch extends LightningElement {
    @track filters = {
        serviceType: 'AC',
        startDate: '',
        durationNights: '1',
        endDate: '',
        quantityRooms: '1',
        liveAvailability: ''
    };

    channelName = '/event/Hotel_Availability_Event__e';
    subscription = null;

    DAY_MS = 24 * 60 * 60 * 1000;

    selectedLocations = [];
    selectableHotels = [];
    selectedSuppliers = [];
    selectedSupplierCrmCodes = [];
    selectedStarRatings = [];
    selectedSupplierStatuses = [];
    selectedAttractions = [];

    starOptions = [
        { label: '5 Star', value: '5 Star' },
        { label: '4 Star', value: '4 Star' },
        { label: '3 Star', value: '3 Star' }
    ];

    supplierStatusOptions = [
        { label: 'Super Preferred', value: 'Super Preferred' },
        { label: 'Preferred', value: 'PF' },
        { label: 'Standard', value: 'Standard' },
        { label: 'Blacklisted', value: 'Blacklisted' }
    ];

    serviceTypeMap = {
        'AC': 'Accommodation',
        'TF': 'Transfer',
        'DT': 'Day Tours',
        'OV': 'Overland Tours',
        'PK': 'Short-break Packages'
    }

    @api recordId;

    @track rows = [];
    @track groups = [];
    @track locationOptions = [];
    quoteData = {};

    @track loading = false;
    error;
    adults = 0;
    children = 0;
    infants = 0;
    @track loadLoc = false;
    @track loadAttractions = false;
    @track supplierRecordTypeId;
    @track attractionsOptions = [];
    optExternalIds = [];

    @track groupEdits = {};
    lastSelectedLocationCodes = [];
    @track starHeaderOptions = [];
    @track selectedKeys = {};
    ferretDestinations = {};
    @track dateSections = [];
    currencyMap = {};
    countryMarkups = {};
    serviceTypeMarkups = {};
    supplierMarkups = {};
    requestedCrmCodes = new Set();
    @track crmNameMap = {};

    @track roomConfigs = [];
    roomTypeOptions = [
        { label: 'DOUBLE AVAIL', value: 'DOUBLE AVAIL' },
        { label: 'TWIN AVAIL', value: 'TWIN AVAIL' },
        { label: 'TRIPLE AVAIL', value: 'TRIPLE AVAIL' },
    ];
    @track validationError = '';

    connectedCallback() {
        this.loadLocationOptions();
        this.loadPassengerCounts();
        this.loadTravelDates();
        this.starHeaderOptions = [...(this.starOptions || [])];
        this.initPeSubscription();
        this.syncRoomsToQuantity();
    };

    disconnectedCallback() {
        this.teardownPeSubscription();
    };

    @wire(getObjectInfo, { objectApiName: ACCOUNT_OBJECT })
    accountMetadata({ data, error }) {
        if (data) {
            const recordTypeInfos = data.recordTypeInfos;
            for (let rtId in recordTypeInfos) {
                if (recordTypeInfos[rtId].name === 'Supplier') {
                    this.supplierRecordTypeId = rtId;
                    break;
                }
            }
        } else if (error) {
            console.error('Error fetching Account object info: ', error);
        }
    };

    @wire(getPicklistValues, {
        recordTypeId: '$supplierRecordTypeId',
        fieldApiName: ATTRACTIONS_FIELD
    })
    attractionsPicklistValues({ data, error }) {
        if (data) {
            this.attractionsOptions = data.values.map(v => ({ label: v.label, value: v.value }));
            this.loadAttractions = true;
        } else if (error) {
            console.error('Error fetching attractions picklist values: ', error);
        }
    }

    @wire(getFerretDestinationFromCrmCode, {})
    crmCodeToFerretDestinations({ data, error }) {
        if (data) {
            this.ferretDestinations = data;
        } else if (error) {
            console.error('Error retrieving Ferret Destinations: ', error);
        }
    }

    @wire(getOptsExternalIds, {})
    getExternalIds({ data, error }) {
        if (data) {
            this.optExternalIds = data;
        } else if (error) {
            console.error('Error retrieving External IDs: ', error);
        }
    }

    @wire(getAllCurrencyMapByBaseCurrency, {})
    getCurrencyMap({ data, error }) {
        if (data) {
            this.currencyMap = data;
        } else if (error) {
            console.error('Error retrieving Currency Map: ', error);
        }
    }

    @wire(getQuoteDetails, { quoteId: '$recordId' })
    quoteDetails({ data, error }) {
        if (data) {
            this.quoteData = data;
        } else if (error) {
            console.error('Error retrieving Quote Details: ', error);
        }
    }

    @wire(getCountryMarkups, {})
    countryMarkups({ data, error }) {
        if (data) {
            this.countryMarkups = data;
        } else if (error) {
            console.error('Error retrieving Country Markups: ', error);
        }
    }

    @wire(getServiceTypeMarkups, {})
    serviceTypeMarkups({ data, error }) {
        if (data) {
            this.serviceTypeMarkups = data;
        } else if (error) {
            console.error('Error retrieving Service Type Markups: ', error);
        }
    }

    @wire(getSupplierMarkups, {})
    supplierMarkups({ data, error }) {
        if (data) {
            this.supplierMarkups = data;
        } else if (error) {
            console.error('Error retrieving Supplier Markups: ', error);
        }
    }

    renderedCallback() {
        const locationComponent = this.template.querySelector('[role="cm-picklist"]');
        if (locationComponent != null && this.loadLoc) {
            locationComponent.setOptions(this.locationOptions);
            if (this.selectedLocations.length > 0) {
                locationComponent.setSelectedList(this.selectedLocations?.map(l => l.label).join(';'));
            }

        }

        const starComponent = this.template.querySelector('[role="star-picklist"]');
        if (starComponent != null) {
            starComponent.setOptions(this.starOptions);
            if (this.selectedStarRatings.length > 0) {
                starComponent.setSelectedList(this.selectedStarRatings.join(';'));
            }
        }

        const statusComponent = this.template.querySelector('[role="status-picklist"]');
        if (statusComponent != null) {
            statusComponent.setOptions(this.supplierStatusOptions);
            if (this.selectedSupplierStatuses.length > 0) {
                statusComponent.setSelectedList(this.selectedSupplierStatuses.join(';'));
            }
        }

        const attractionsComponent = this.template.querySelector('[role="attractions-picklist"]');
        if (attractionsComponent != null && this.loadAttractions) {
            attractionsComponent.setOptions(this.attractionsOptions);
            if (this.selectedAttractions.length > 0) {
                attractionsComponent.setSelectedList(this.selectedAttractions.join(';'));
            }
        }

        const supplierComponent = this.template.querySelector('[role="cms-picklist"]');
        if (supplierComponent != null) {
            if (this.selectedSuppliers.length > 0) {
                supplierComponent.setSelectedList(
                    this.selectedSuppliers.map(s => s.label).join(';')
                );
            }
        }
    };

    loadLocationOptions() {
        this.loading = true;
        getLocationOptions().then((options) => {
            this.locationOptions = (options || [])
                .map(o => ({ label: o.label, value: o.value }))
                .sort((a, b) => a.label.localeCompare(b.label));
            this.loadLoc = true;
        }).catch((e) => {
            console.error(`${e}`);
        }).finally(() => {
            this.loading = false;
        });
    };

    loadPassengerCounts() {
        this.loading = true;
        getPassengerTypeCounts({ quoteId: this.recordId }).then((counts) => {
            this.adults = counts.Adult || 0;
            this.children = counts.Child || 0;
            this.infants = counts.Infant || 0;
            this.syncRoomsToQuantity(this.filters.quantityRooms);
        }).catch((e) => {
            console.error(`${e}`);
        }).finally(() => {
            this.loading = false;
        });
    };

    loadTravelDates() {
        this.loading = true;
        getTravelDatesFromQuote({ quoteId: this.recordId }).then((data) => {
            this.filters.startDate = data.startDate;
            this.filters.durationNights = String(data.durationNights);
            this.filters.endDate = this.computeEndDate(this.filters.startDate, this.filters.durationNights);
        }).catch((e) => {
            console.error(`${e}`);
        }).finally(() => {
            this.loading = false;
        });
    };

    initPeSubscription() {
        try {
            setDebugFlag(true);

            onError((error) => {
                console.error('EMP API error: ', JSON.stringify(error));
            });

            subscribe(this.channelName, -1, this.handlePeMessage).then((resp) => {
                this.subscription = resp;
            });
        } catch (e) {
            console.error('PE subscribe failed', e);
        }
    };

    teardownPeSubscription() {
        try {
            if (this.subscription) {
                unsubscribe(this.subscription, () => {
                });
                this.subscription = null;
            }
        } catch (e) {
            console.error('PE unsubscribe failed', e);
        }
    };

    get optIdAllowlist() {
        return new Set((this.optExternalIds || []).map(x => String(x).trim().toUpperCase()));
    };

    activateLocationTooltip = (event) => {
        const crmCode = event.target.dataset.crm;
        this.groups = (this.groups || []).map(g =>
            g.crmCode === crmCode ? { ...g, showLocationTooltip: true } : { ...g, showLocationTooltip: false }
        );
    };

    deactivateLocationTooltip = (event) => {
        const crmCode = event.target.dataset.crm;
        this.groups = (this.groups || []).map(g =>
            g.crmCode === crmCode ? { ...g, showLocationTooltip: false } : g
        );
    };

    isOptAllowed(optId) {
        const id = (optId ?? '').toString().trim().toUpperCase();
        const list = this.optIdAllowlist;
        return id && list.has(id);
    };

    handlePeMessage = async (message) => {
        try {
            const payload = message?.data?.payload || {};
            const quoteIdFromPe = payload.Quote_Id__c;

            if (!quoteIdFromPe || quoteIdFromPe !== this.recordId) return;

            let raw;
            if (payload.Hotel_JSON__c) {
                try { raw = JSON.parse(payload.Hotel_JSON__c); } catch { return; }
            } else {
                raw = payload;
            }

            const requestedSet = this.parseRequestedCrmsFromRequestJson(payload.Request_JSON__c);
            this.requestedCrmCodes = new Set([
                ...(this.requestedCrmCodes || []),
                ...(requestedSet || [])
            ]);

            if (requestedSet && requestedSet.size) {
                try {
                    const crmList = [...requestedSet];
                    const nameMap = await getSupplierNamesByCrmCodes({ crmCodes: crmList });
                    this.crmNameMap = { ...this.crmNameMap, ...(nameMap || {}) };
                } catch (nameErr) {
                    console.warn('Could not resolve supplier names for CRMs:', [...requestedSet], nameErr);
                }
            }

            const peStart = payload.Start_Date__c || '';
            const peEnd = payload.End_Date__c || '';
            const peNights = (peStart && peEnd) ? this.computeNights(peStart, peEnd) : '';

            this.appendResultsFromRaw(raw, "Agent", {
                requestedCrms: [...requestedSet],
                peStart,
                peEnd,
                peNights
            });
        } catch (e) {
            console.error('handlePeMessage error', e);
        }
    };

    appendResultsFromRaw(raw, source, meta = { peStart: '', peEnd: '' }) {
        const fetchedRows = this.transformApiData(raw);

        let filtered = fetchedRows.filter(r => this.isOptAllowed(r.optId));

        let ctxStart = '';
        let ctxNights = '1';

        if (source === 'Search') {
            ctxStart = this.filters.startDate || '';
            ctxNights = String(this.filters.durationNights || '1');
        } else if (source === 'Agent') {
            ctxStart = meta?.peStart || this.filters.startDate || '';
            ctxNights = String(meta?.peNights || this.filters.durationNights || '1');
        }

        filtered = this.applyDateContext(filtered, ctxStart, ctxNights);

        if (!this.lastSelectedLocationCodes || this.lastSelectedLocationCodes.length === 0) {
            const derived = [...new Set(filtered.map(r => r.locCode).filter(Boolean))];
            if (derived.length > 0) this.lastSelectedLocationCodes = derived;
        }

        if (source === "Search") {
            const live = this.filters.liveAvailability;
            filtered = filtered.filter(r => {
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
        }

        if (source === "Agent" && (meta?.peStart || meta?.peEnd)) {
            const crmInThisBatch = new Set(filtered.map(r => r.crmCode).filter(Boolean));
            const nightsFromPe = (meta.peStart && meta.peEnd)
                ? this.computeNights(meta.peStart, meta.peEnd)
                : (this.filters.durationNights || '1');

            crmInThisBatch.forEach(crm => {
                const startDate = meta.peStart || (this.groupEdits[crm]?.startDate ?? this.filters.startDate ?? '');
                const durationNights = String(nightsFromPe || this.groupEdits[crm]?.durationNights || this.filters.durationNights || '1');
                const endDate = startDate ? this.computeEndDate(startDate, durationNights) : '';

                this.groupEdits[crm] = {
                    ...this.groupEdits[crm],
                    startDate,
                    durationNights,
                    endDate
                };
            });
        }

        const ts = Date.now();
        const normalizedNew = filtered.map((r, i) => {
            const selected = !!this.selectedKeys[r.selKey];
            return {
                ...r,
                id: `${r.uniqueKey}-${ts}-${i}`,
                isSelected: selected,
                selectButtonClass: this.computeSelectClass(selected),
            };
        });

        const existingByUniqueKey = new Map((this.rows || []).map(r => [r.uniqueKey, r]));
        for (const nr of normalizedNew) {
            if (!existingByUniqueKey.has(nr.uniqueKey)) {
                existingByUniqueKey.set(nr.uniqueKey, nr);
            }
        }
        const mergedRows = Array.from(existingByUniqueKey.values());

        this.rows = mergedRows;
        this.groups = this.groupBySupplier(mergedRows);

        if (meta?.requestedCrms && meta.requestedCrms.length) {
            meta.requestedCrms.forEach(c => { if (c) this.requestedCrmCodes.add(c); });
        }
        this.injectEmptyGroupsForRequested(meta);

        this.buildDateSections();
        this.hasSearched = true;
    };

    get serviceTypeOptions() {
        return [
            { label: 'Accommodation', value: 'AC' },
            { label: 'Transfer', value: 'TF' },
            { label: 'Day Tours', value: 'DT' },
            { label: 'Overland Tours', value: 'OV' },
            { label: 'Short-break Packages', value: 'PK' },
        ];
    };

    get durationOptions() {
        return Array.from({ length: 30 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }));
    };
    get roomQtyOptions() {
        return Array.from({ length: 9 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }));
    };
    get liveAvailOptions() {
        return [
            { label: 'Any', value: '' },
            { label: 'Available', value: 'OK' },
            { label: 'On Request', value: 'RQ' },
        ];
    };

    get selectedCount() {
        return Object.keys(this.selectedKeys).filter(k => this.selectedKeys[k]).length;
    };
    get hasSelection() { return this.selectedCount > 0; };
    get disableSave() { return !this.hasSelection; };

    computeSelectClass(isSelected) {
        return `select-button${isSelected ? ' selected' : ''}`;
    };

    computeNights(startIso, endIso) {
        if (!startIso || !endIso) return '';
        const s = new Date(`${startIso}T00:00:00`);
        const e = new Date(`${endIso}T00:00:00`);
        const days = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
        const nights = Math.max(1, days);
        return String(nights);
    };

    getCrmFromOpt(optId = '') {
        if (!optId || optId.length < 11) return '';
        return optId.substring(5, 11);
    }

    parseRequestedCrmsFromRequestJson(reqJson) {
        const out = new Set();
        try {
            const body = (typeof reqJson === 'string') ? JSON.parse(reqJson) : (reqJson || {});
            const recs = Array.isArray(body?.records) ? body.records : [];
            recs.forEach(r => {
                const crm = this.getCrmFromOpt(r?.Opt || '');
                if (crm) out.add(crm);
            });
        } catch (e) {
            console.error('Failed to parse requested CRMs', e);
        }
        return out;
    }

    injectEmptyGroupsForRequested(meta = {}) {
        if (!this.requestedCrmCodes || this.requestedCrmCodes.size === 0) return;

        const existing = new Set((this.groups || []).map(g => g.crmCode));
        const missing = [...this.requestedCrmCodes].filter(c => c && !existing.has(c));
        if (missing.length === 0) return;

        const defaultStart = meta.peStart || this.filters.startDate || '';
        const defaultNights = String(meta.peNights || this.filters.durationNights || '1');
        const defaultEnd = defaultStart ? this.computeEndDate(defaultStart, defaultNights) : '';

        const added = missing.map(crm => {
            const supplierName = this.crmNameMap[crm] || crm;
            const ferret = this.ferretDestinations?.[crm] || '';
            let firstLocality = '';
            if (ferret) firstLocality = this.pickParentDestination(ferret) || ferret;

            return {
                crmCode: crm,
                supplier: supplierName,
                items: [],
                firstLocality,
                ferretDestinationLocation: ferret,
                uiStartDate: defaultStart,
                uiEndDate: defaultEnd,
                uiDurationNights: defaultNights,
                uiQuantityRooms: String(this.filters.quantityRooms || '1'),
                uiStarRating: '',
                loading: false
            };
        });

        this.groups = [...(this.groups || []), ...added]
            .sort((a, b) => (a.supplier || '').localeCompare(b.supplier || ''));
        this.buildDateSections();

        (added || []).forEach(g => {
            if (!this.groupEdits[g.crmCode]) {
                this.groupEdits = {
                    ...this.groupEdits,
                    [g.crmCode]: {
                        startDate: g.uiStartDate || '',
                        durationNights: g.uiDurationNights || '1',
                        endDate: g.uiEndDate || '',
                        quantityRooms: g.uiQuantityRooms || String(this.filters.quantityRooms || '1'),
                        starRating: g.uiStarRating || ''
                    }
                };
            }
        });
    }

    parseMidnight(iso) {
        if (!iso) return null;
        const d = new Date(`${iso}T00:00:00`);
        return isNaN(d) ? null : d;
    };

    diffDays(fromIso, toIso) {
        const a = this.parseMidnight(fromIso);
        const b = this.parseMidnight(toIso);
        if (!a || !b) return null;
        return Math.round((b - a) / this.DAY_MS);
    };

    computeDayLabel(tripStartIso, secStartIso, secEndIso, endInclusive = true) {
        if (!tripStartIso || !secStartIso || !secEndIso) return '';
        const startIdx = (this.diffDays(tripStartIso, secStartIso) ?? -1) + 1;
        let endIdx = (this.diffDays(tripStartIso, secEndIso) ?? -1) + 1;
        if (!endInclusive) endIdx -= 1;
        if (startIdx < 1 || endIdx < startIdx) return '';
        return `Day ${startIdx}-${endIdx}`;
    };

    makeDateKey(startIso, endIso) {
        const s = startIso || '';
        const e = endIso || '';
        return `${s}|${e}`;
    };

    formatRangeTitle(startIso, endIso) {
        if (!startIso || !endIso) return 'No dates';
        const s = new Date(`${startIso}T00:00:00`);
        const e = new Date(`${endIso}T00:00:00`);
        if (isNaN(s) || isNaN(e)) return 'No dates';

        const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();

        const day = (d) => d.toLocaleDateString('en-GB', { day: '2-digit' });
        const mon = (d) => d.toLocaleDateString('en-GB', { month: 'short' });
        const yr = (d) => d.getFullYear();

        if (sameMonth) {
            return `${day(s)}-${day(e)} ${mon(e)} ${yr(e)}`;
        }
        return `${day(s)} ${mon(s)} - ${day(e)} ${mon(e)} ${yr(e)}`;
    };

    buildDateSections() {
        const buckets = new Map();
        let earliestStart = null;

        (this.groups || []).forEach(g => {
            const start = g.uiStartDate || '';
            const end = g.uiEndDate || '';

            const key = this.makeDateKey(start, end);

            if (!buckets.has(key)) {
                buckets.set(key, {
                    key,
                    start,
                    end,
                    title: this.formatRangeTitle(start, end),
                    groups: [],
                    parentDests: new Set()
                });
            }
            buckets.get(key).groups.push(g);

            const rawDest = (g.ferretDestinationLocation || g.firstLocality || '').trim();
            const parent = this.pickParentDestination(rawDest);
            if (parent) buckets.get(key).parentDests.add(parent);

            const s = this.parseMidnight(start);
            if (s && (!earliestStart || s < earliestStart)) earliestStart = s;
        });

        const parse = (iso) => (iso ? Date.parse(`${iso}T00:00:00`) : Number.POSITIVE_INFINITY);

        const sorted = Array.from(buckets.values()).sort((a, b) => {
            const sa = parse(a.start), sb = parse(b.start);
            if (sa !== sb) return sa - sb;
            const ea = parse(a.end), eb = parse(b.end);
            return ea - eb;
        });

        const tripStartIso =
            earliestStart
                ? new Date(earliestStart.getTime() - (earliestStart.getTimezoneOffset() * 60000))
                    .toISOString().slice(0, 10)
                : (sorted.find(sec => sec.start)?.start || this.filters?.startDate || '');

        this.dateSections = sorted.map(sec => {
            const list = Array.from(sec.parentDests).sort((x, y) => x.localeCompare(y));
            let destLabel = '';
            if (list.length === 1) destLabel = list[0];
            else if (list.length === 2) destLabel = `${list[0]}, ${list[1]}`;
            else if (list.length === 3) destLabel = `${list[0]}, ${list[1]}, ${list[2]}`;
            else if (list.length >= 4) destLabel = `${list[0]}, ${list[1]} +${list.length - 2} more`;

            const dayLabel = this.computeDayLabel(tripStartIso, sec.start, sec.end, true);

            return { ...sec, destLabel, dayLabel };
        });
    };

    normalizeDestinationParts(str) {
        if (!str) return [];
        return String(str)
            .split(/\s*\|\s*|\s*,\s*/g)
            .map(s => s.trim())
            .filter(Boolean);
    };

    pickParentDestination(str) {
        const parts = this.normalizeDestinationParts(str);
        if (parts.length >= 3) return parts[parts.length - 2];
        if (parts.length === 2) return parts[0];
        return parts[0] || '';
    };

    handleInput = (e) => {
        const { name, value } = e.target;

        let next = { ...this.filters, [name]: value };

        if (name === 'locationCode') {
            const picked = this.locationOptions.find(o => o.value === value);
            next.location = picked?.label || '';
        }

        if (name === 'startDate' || name === 'durationNights') {
            next.endDate = this.computeEndDate(next.startDate, next.durationNights);
        }

        this.filters = next;

        if (name === 'quantityRooms') {
            this.syncRoomsToQuantity(value);
        }
    };

    makeDefaultRoom(idx) {
        return { id: idx + 1, roomType: 'DOUBLE AVAIL', adults: 0, children: 0, infants: 0, passengers: 0 };
    };

    /*syncRoomsToQuantity(qty) {
        const n = Math.max(1, parseInt(qty, 10) || 1);
        let rooms = [...(this.roomConfigs || [])];
        const oldLen = rooms.length;

        if (oldLen < n) {
            for (let i = oldLen; i < n; i++) rooms.push(this.makeDefaultRoom(i));
        } else if (oldLen > n) {
            rooms = rooms.slice(0, n);
        }

        const allZero = rooms.every(r =>
            ((+r.adults || 0) + (+r.children || 0) + (+r.infants || 0)) === 0
        );
        if (allZero) {
            const split = (total) => {
                total = parseInt(total) || 0;
                const base = Math.floor(total / n);
                const rem = total % n;
                return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
            };
            const ad = split(this.adults);
            const ch = split(this.children);
            const inf = split(this.infants);
            rooms = rooms.map((r, i) => ({
                ...r,
                adults: ad[i],
                children: ch[i],
                infants: inf[i]
            }));
        }

        this.roomConfigs = rooms.map((r, i) => ({
            ...r,
            id: i + 1,
            passengers: (parseInt(r.adults) || 0) + (parseInt(r.children) || 0) + (parseInt(r.infants) || 0)
        }));
        this.validationError = '';
    };*/

    syncRoomsToQuantity(qty) {
        let rooms = [...(this.roomConfigs || [])];

        if (qty != null && rooms.length > 0) {
            const numRooms = Math.max(1, parseInt(qty, 10));
            if (rooms.length < numRooms) {
                for (let i = rooms.length; i < numRooms; i++) {
                    let r = this.makeDefaultRoom(i);
                    r.id = i + 1;
                    rooms.push(r);
                }
            } else if (rooms.length > numRooms) {
                rooms = rooms.slice(0, numRooms);
            }
            this.roomConfigs = rooms.map((r, i) => ({
                ...r,
                id: i + 1,
                passengers: (+r.adults || 0) + (+r.children || 0) + (+r.infants || 0)
            }));
            this.validationError = '';
            return;
        }

        rooms = [];

        let totalAdults = this.adults != null ? parseInt(this.adults) : 2;
        let totalChildren = this.children != null ? parseInt(this.children) : 0;
        let totalInfants = this.infants != null ? parseInt(this.infants) : 0;

        const maxAdultsPerRoom = 2;
        const maxChildrenPerRoom = 2;

        while (totalAdults > 0 || totalChildren > 0 || totalInfants > 0) {
            let assignAdults = Math.min(maxAdultsPerRoom, totalAdults);
            let assignChildren = Math.min(maxChildrenPerRoom, totalChildren);
            let assignInfants = totalInfants > 0 ? 1 : 0;

            let r = this.makeDefaultRoom(rooms.length);
            r.adults = assignAdults;
            r.children = assignChildren;
            r.infants = assignInfants;
            r.passengers = assignAdults + assignChildren + assignInfants;
            r.id = rooms.length + 1;

            rooms.push(r);

            totalAdults -= assignAdults;
            totalChildren -= assignChildren;
            totalInfants -= assignInfants;
        }

        this.roomConfigs = rooms;
        this.filters.quantityRooms = String(rooms.length);
        this.validationError = '';
    }


    handleRoomChange = (e) => {
        const idx = Number(e.currentTarget.dataset.index);
        const { name, value } = e.target;

        const rooms = [...this.roomConfigs];
        const before = rooms[idx];
        const next = { ...before };

        if (name === 'roomType') {
            next.roomType = value;
        } else {
            const v = Math.max(0, parseInt(value, 10) || 0);
            next[name] = v;
        }
        next.passengers = (+next.adults || 0) + (+next.children || 0) + (+next.infants || 0);

        const proposed = [...rooms];
        proposed[idx] = next;

        const s = this.sumRooms(proposed);
        let msg = '';
        if (s.adults > (this.adults || 0)) msg = '* You have exceeded the allowed number of Adult passengers.';
        else if (s.children > (this.children || 0)) msg = '* You have exceeded the allowed number of Child passengers.';
        else if (s.infants > (this.infants || 0)) msg = '* You have exceeded the allowed number of Infant passengers.';

        if (msg) {
            this.validationError = msg;
            this.roomConfigs = rooms;
            return;
        }

        this.validationError = '';
        rooms[idx] = next;
        this.roomConfigs = rooms;
    };

    buildApiRoomConfigs(qtyOverride) {
        const qty = parseInt(qtyOverride ?? this.filters.quantityRooms, 10) || 1;
        this.syncRoomsToQuantity(qty);

        return (this.roomConfigs || []).map(r => ({
            RoomConfig: {
                Adults: parseInt(r.adults) || 0,
                Children: parseInt(r.children) || 0,
                Infants: parseInt(r.infants) || 0
            }
        }));
    };

    buildQliRoomConfigurations(defaultRow) {
        return (this.roomConfigs || []).map((rc, i) => {
            const a = parseInt(rc.adults) || 0;
            const c = parseInt(rc.children) || 0;
            const inf = parseInt(rc.infants) || 0;
            return {
                id: i + 1,
                serviceType: 'Accommodation',
                serviceSubtype: rc.roomType || defaultRow?.roomType || 'TWIN AVAIL',
                adults: a,
                children: c,
                infants: inf,
                passengers: a + c + inf,
                quoteLineItemId: null,
                order: i + 1
            };
        });
    };

    computeEndDate(startIso, nights) {
        if (!startIso) return '';
        const n = parseInt(nights, 10);
        const nightsInt = Number.isFinite(n) ? n : 0;
        const d = new Date(`${startIso}T00:00:00`);
        d.setDate(d.getDate() + nightsInt + 1);

        return d.toISOString().slice(0, 10);
    };

    sumRooms(rooms = this.roomConfigs) {
        return rooms.reduce((a, r) => {
            a.adults += parseInt(r.adults) || 0;
            a.children += parseInt(r.children) || 0;
            a.infants += parseInt(r.infants) || 0;
            return a;
        }, { adults: 0, children: 0, infants: 0 });
    };

    validateRoomTotalsExact(rooms = this.roomConfigs) {
        const s = this.sumRooms(rooms);
        const mismatch =
            s.adults !== (this.adults || 0) ||
            s.children !== (this.children || 0) ||
            s.infants !== (this.infants || 0);

        if (mismatch) {
            this.showToast(
                'Room totals must match quote',
                `Entered Adults/Children/Infants = ${s.adults}/${s.children}/${s.infants}; ` +
                `Quote Adults/Children/Infants = ${this.adults}/${this.children}/${this.infants}.`,
                'error'
            );
            return false;
        }
        return true;
    };

    decodeHtml(str = '') {
        const txt = document.createElement('textarea');
        txt.innerHTML = str;
        return txt.value;
    };

    async handleSearch() {
        this.loading = true;
        this.error = undefined;

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

        if (!this.validateRoomTotalsExact()) {
            this.loading = false;
            return;
        }

        try {
            const locationData = await getSelectedLocationsWithCodes({
                locationIds: this.selectedLocations.map(l => l.value),
            });
            const newLocCodes = (locationData || []).map(l => l.LOC_Name__c);

            const locUnion = new Set([...(this.lastSelectedLocationCodes || []), ...newLocCodes]);
            this.lastSelectedLocationCodes = Array.from(locUnion);

            const payloads = [];
            const hotelCrmCodes =
                (this.selectedSupplierCrmCodes && this.selectedSupplierCrmCodes.length > 0)
                    ? this.selectedSupplierCrmCodes
                    : [null];

            this.requestedCrmCodes = new Set([
                ...(this.requestedCrmCodes || []),
                ...((hotelCrmCodes || []).filter(Boolean))
            ]);

            locationData.forEach(loc => {
                const locationCode = loc.LOC_Name__c;
                hotelCrmCodes.forEach(crmCode => {
                    const opt = crmCode
                        ? `${locationCode}${this.filters.serviceType}${crmCode}??????`
                        : `${locationCode}${this.filters.serviceType}????????????`;

                    const roomConfigs = this.buildApiRoomConfigs(this.filters.quantityRooms);

                    payloads.push({
                        Opt: opt,
                        Info: 'GSI',
                        DateFrom: this.filters.startDate,
                        SCUqty: this.filters.durationNights,
                        ButtonName: this.serviceTypeMap[this.filters.serviceType] || 'Accommodation',
                        RoomConfigs: roomConfigs,
                        MaximumOptions: 30
                    });
                });
            });

            console.log('Search payloads', payloads);

            const requestPayload = { records: payloads };
            const body = await getOptions({ reqPayload: JSON.stringify(requestPayload) });
            const raw = (typeof body === 'string') ? JSON.parse(body) : body;

            console.log('Search results', raw);

            this.appendResultsFromRaw(raw, "Search", {
                requestedCrms: (hotelCrmCodes || []).filter(Boolean),
                peStart: '', peEnd: ''
            });
        } catch (err) {
            this.error = (err && err.body && err.body.message)
                ? err.body.message
                : (err?.message || 'Unexpected error');
        } finally {
            this.loading = false;
            this.hasSearched = true;
        }
    };

    applyDateContext(rows, startIso, nightsStr) {
        const start = startIso || '';
        const nights = String(nightsStr || '1');
        const end = start ? this.computeEndDate(start, nights) : '';
        const dateKey = this.makeDateKey(start, end);

        return (rows || []).map(r => {
            const uniqueKey = `${r.selKey}|${dateKey}`;
            const isSelected = !!this.selectedKeys[uniqueKey];
            return {
                ...r,
                dateStart: start,
                dateEnd: end,
                dateKey,
                uniqueKey,
                isSelected,
                selectButtonClass: this.computeSelectClass(isSelected)
            };
        });
    }


    handleGroupHeaderInput = (e) => {
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

        this.buildDateSections();
    };


    transformApiData(apiPayload) {
        const payload = (typeof apiPayload === 'string') ? JSON.parse(apiPayload) : apiPayload;

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
            const supplier = this.decodeHtml(gen?.SupplierName || '');
            const desc = this.decodeHtml(gen?.Description || '');
            const locality = this.decodeHtml(gen?.LocalityDescription || gen?.Locality || '');
            const childPolicy = this.composeChildPolicy(gen);
            const supplierStatus = gen?.DBAnalysisCode1 || '';
            const starRating = gen?.ClassDescription || '';
            const country = gen?.Address5 || '';
            const buttonName = gen?.ButtonName || '';

            const optMeta = {
                optId: opt?.Opt || '',
                optionNumber: opt?.OptionNumber || ''
            };

            const rawStay = opt?.OptStayResults;
            const stays = Array.isArray(rawStay) ? rawStay : (rawStay ? [rawStay] : []);

            stays.forEach((stay, idx) => {
                const row = this.mapStayToRow(stay, supplier, desc, locality, childPolicy, optMeta, supplierStatus, starRating, country, buttonName);
                out.push({ ...row, id: `${optMeta.optionNumber || optMeta.optId}-${idx}` });
            });
        });

        return out;
    };

    mapStayToRow(stay, supplier, desc, locality, childPolicy, optMeta = { optId: '', optionNumber: '' }, supplierStatus, starRating, country, buttonName) {
        const availabilityCode = (stay?.Availability || '').toUpperCase();
        const statusMap = { OK: 'Available', RQ: 'On Request', NO: 'Unavailable', NA: 'Unavailable' };
        const status = statusMap[availabilityCode] || (availabilityCode || '—');
        const crmCode = this.extractCrm(optMeta.optId);

        if (crmCode && supplier) {
            this.crmNameMap[crmCode] = supplier;
        }

        const currency = stay?.Currency || 'ZAR';
        const nettPrice = stay?.AgentPrice ?? stay?.TotalPrice;

        const markup = ((this.countryMarkups[country] || 0) / 100 + (this.serviceTypeMarkups[buttonName] || 0) / 100 + ((this.supplierMarkups[crmCode] || 0) / 100)) * 100;

        const gp = (1 - (1 / (1 + markup / 100))) * 100;

        const sellPrice = Math.round(nettPrice / (1 - gp / 100));


        const nett = this.formatNetMoney(nettPrice, currency);
        const sell = this.formatMoney(sellPrice, currency);

        const rateText = this.decodeHtml(
            (typeof stay?.RateText === 'string' && stay.RateText) ||
            (stay?.ExternalRateDetails?.ExtRatePlanDescr) ||
            ''
        );


        const externalDescr = this.decodeHtml(stay?.ExternalRateDetails?.ExtOptionDescr || '');
        const roomType = stay?.RoomList?.RoomType || 'TWIN AVAIL';
        const rateId = stay?.RateId || '';
        const selKey = `${optMeta.optId}#${rateId}`;
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
            locCode: this.extractLoc(optMeta.optId),
            currency
        };
    };

    async resolveLocationCodesForGroup(crm) {
        if (this.lastSelectedLocationCodes && this.lastSelectedLocationCodes.length) {
            return [...this.lastSelectedLocationCodes];
        }

        if (this.selectedLocations && this.selectedLocations.length) {
            const locs = await getSelectedLocationsWithCodes({
                locationIds: this.selectedLocations.map(l => l.value)
            });
            return (locs || []).map(l => l.LOC_Name__c);
        }

        const grp = (this.groups || []).find(g => g.crmCode === crm);
        const firstLocality = (grp && grp.firstLocality) ? grp.firstLocality.trim().toLowerCase() : '';
        if (firstLocality) {
            const match = (this.locationOptions || []).find(
                o => (o.label || '').trim().toLowerCase() === firstLocality
            );
            if (match) {
                const locs = await getSelectedLocationsWithCodes({ locationIds: [match.value] });
                return (locs || []).map(l => l.LOC_Name__c);
            }
        }

        return [];
    };

    handleChangeLocation(event) {
        const selectedOptions = event.detail.options.filter(opt => opt.checked);
        const selectedLocs = selectedOptions.map(opt => ({ value: opt.value, label: opt.label }));
        this.selectedLocations = selectedLocs;
        this.getHotels();
    };

    async getHotels() {
        this.selectableHotels = await getHotelsFromLocations({ locationIds: this.selectedLocations.map(l => l.value) });
        (this.selectableHotels || []).forEach(opt => {
            if (opt?.value && opt?.label) this.crmNameMap[opt.value] = opt.label;
        });
        const supplierComponent = this.template.querySelector('[role="cms-picklist"]');
        if (supplierComponent) {
            supplierComponent.setOptions(this.selectableHotels);

            const stillValid = (this.selectedSuppliers || []).filter(sel =>
                this.selectableHotels.some(opt => opt.value === sel.value)
            );

            this.selectedSuppliers = stillValid;
            this.selectedSupplierCrmCodes = stillValid.map(s => s.value);

            if (stillValid.length) {
                supplierComponent.setSelectedList(stillValid.map(s => s.label).join(';'));
            }
        }
    };

    handleChangeSupplier(event) {
        const selectedSupplierOptions = event.detail.options.filter(opt => opt.checked);
        this.selectedSupplierCrmCodes = selectedSupplierOptions.map(opt => opt.value);
        const selectedSup = selectedSupplierOptions.map(opt => ({ value: opt.value, label: opt.label }));
        this.selectedSuppliers = selectedSup;
        (this.selectedSuppliers || []).forEach(s => {
            if (s?.value && s?.label) this.crmNameMap[s.value] = s.label;
        });
    };

    handleChangeStarRating(event) {
        const selectedOptions = event.detail.options.filter(opt => opt.checked);
        this.selectedStarRatings = selectedOptions.map(opt => opt.value);
    };

    handleChangeSupplierStatus(event) {
        const selectedOptions = event.detail.options.filter(opt => opt.checked);
        this.selectedSupplierStatuses = selectedOptions.map(opt => opt.value);
    };

    handleChangeAttractions(event) {
        const selectedOptions = event.detail.options.filter(opt => opt.checked);
        this.selectedAttractions = selectedOptions.map(opt => opt.value);
    };

    handleRowCheckboxChange = (e) => {
        const rowKey = e.target.dataset.rowKey;
        const checked = e.target.checked;

        this.selectedKeys = { ...this.selectedKeys, [rowKey]: checked };

        this.rows = (this.rows || []).map(r =>
            r.uniqueKey === rowKey ? { ...r, isSelected: checked } : r
        );

        this.groups = (this.groups || []).map(g => ({
            ...g,
            items: g.items.map(it =>
                it.uniqueKey === rowKey ? { ...it, isSelected: checked } : it
            )
        }));

        this.buildDateSections();
    };

    handleClearSelection = () => {
        this.selectedKeys = {};
        this.rows = (this.rows || []).map(r => ({
            ...r,
            isSelected: false,
            selectButtonClass: this.computeSelectClass(false)
        }));
        this.groups = (this.groups || []).map(g => ({
            ...g,
            items: g.items.map(it => ({
                ...it,
                isSelected: false,
                selectButtonClass: this.computeSelectClass(false)
            }))
        }));

        this.buildDateSections();
    };

    extractCrm(optId) {
        if (!optId || optId.length < 11) return '';
        return optId.substring(5, 11);
    };

    extractLoc(optId) {
        if (!optId || optId.length < 3) return '';
        return optId.substring(0, 3);
    };


    groupBySupplier(rows) {
        const map = new Map();

        rows.forEach(r => {
            const crm = r.crmCode || '—';
            const dkey = r.dateKey || this.makeDateKey(r.dateStart || '', r.dateEnd || '');
            const gkey = `${crm}|${dkey}`;
            if (!map.has(gkey)) {
                map.set(gkey, {
                    groupKey: gkey,
                    crmCode: crm,
                    dateKey: dkey,
                    supplier: r.supplier || '—',
                    uiStartDate: r.dateStart || '',
                    uiEndDate: r.dateEnd || '',
                    uiDurationNights: this.computeNights(r.dateStart, r.dateEnd) || '1',
                    items: []
                });
            }
            map.get(gkey).items.push(r);
        });

        const sortItems = (arr) => arr.slice().sort((x, y) => {
            const s = (x.status || '').localeCompare(y.status || '');
            if (s !== 0) return s;
            const nx = Number((x.nett || '').replace(/[^\d]/g, '')) || 0;
            const ny = Number((y.nett || '').replace(/[^\d]/g, '')) || 0;
            return nx - ny;
        });

        const groups = Array.from(map.values()).map(g => {
            const sorted = sortItems(g.items);
            const firstLocality = sorted.length > 0 ? sorted[0].locality : '';
            let ferretDestinationLocation = this.ferretDestinations[g.crmCode] || firstLocality;

            return {
                ...g,
                items: sorted,
                firstLocality,
                ferretDestinationLocation,
                uiQuantityRooms: String(this.filters.quantityRooms || '1'),
                uiStarRating: '',
                loading: false
            };
        }).sort((a, b) => {
            const s = (a.supplier || '').localeCompare(b.supplier || '');
            if (s) return s;
            return (a.uiStartDate || '').localeCompare(b.uiStartDate || '');
        });

        return groups;
    }



    setGroupLoading(crmCode, value) {
        this.groups = this.groups.map(g =>
            g.crmCode === crmCode ? { ...g, loading: !!value } : g
        );

        this.buildDateSections();
    };

    composeChildPolicy(gen) {
        const aFrom = gen?.Adult_From, aTo = gen?.Adult_To;
        const cFrom = gen?.Child_From, cTo = gen?.Child_To;
        const iFrom = gen?.Infant_From, iTo = gen?.Infant_To;
        const parts = [];
        if (aFrom || aTo) parts.push(`Adults: ${aFrom || '—'}-${aTo || '—'}`);
        if (cFrom || cTo) parts.push(`Child: ${cFrom || '—'}-${cTo || '—'}`);
        if (iFrom || iTo) parts.push(`Infant: ${iFrom || '—'}-${iTo || '—'}`);
        return parts.join(', ') || '—';
    };

    cancelWindow(hours) {
        if (!hours) return 'No';
        const h = Number(hours);
        if (Number.isFinite(h) && h > 0) return 'Yes';
        return 'No';
    };

    formatMoney(amount, currency) {
        if (amount == null || amount === '') return '';
        const n = Number(amount);
        if (!Number.isFinite(n)) return '';
        const val = n / 100;
        const targetCurrency = this.quoteData.Opportunity.Client_Display_Currency__c;
        const rate = this.currencyMap?.[currency]?.[`${targetCurrency}__c`] ?? 1;
        const finalConvertedAmount = Math.round((val * rate));
        return `${targetCurrency} ${finalConvertedAmount.toLocaleString()}`;
    }

    formatNetMoney(amount, currency) {
        if (amount == null || amount === '') return '';
        const n = Number(amount);
        if (!Number.isFinite(n)) return '';
        const val = n / 100;
        return `${currency} ${val.toLocaleString()}`;
    }

    get showNoHotels() {
        return this.hasSearched && !this.loading && !this.error && (!this.groups || this.groups.length === 0);
    };

    handleSaveSelected = async () => {
        const selected = (this.rows || []).filter(r => !!this.selectedKeys[r.uniqueKey] && !r.addDisabled);
        if (selected.length === 0) {
            this.showToast('Nothing to save', 'Please select one or more options first.', 'warning');
            return;
        }
        if (!this.validateRoomTotalsExact()) return;

        this.loading = true;

        let ok = 0, fail = 0;
        const failedMsgs = [];
        let postToast = null;

        try {
            for (const row of selected) {
                try {
                    const selectedOPT = await getOptByOptCode({ optCode: row.optId });
                    if (!selectedOPT || !selectedOPT[0]) {
                        throw new Error(`OPT not found for ${row.optId}`);
                    }

                    const durationNights = this.computeNights(row.dateStart, row.dateEnd) || '1';

                    const roomConfigurations = this.buildQliRoomConfigurations(row);

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
                        serviceDate: row.dateStart,
                        numberOfDays: String(durationNights),
                        displayDuration: String(durationNights),
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

                    if (Array.isArray(result) && result.length === 0) {
                        ok += 1;
                        const k = row.uniqueKey;
                        const newSel = { ...this.selectedKeys };
                        delete newSel[k];
                        this.selectedKeys = newSel;

                        this.rows = (this.rows || []).map(r =>
                            r.uniqueKey === k ? { ...r, isSelected: false, selectButtonClass: this.computeSelectClass(false) } : r
                        );
                        this.groups = (this.groups || []).map(g => ({
                            ...g,
                            items: g.items.map(it =>
                                it.uniqueKey === k ? { ...it, isSelected: false, selectButtonClass: this.computeSelectClass(false) } : it
                            )
                        }));
                    } else {
                        throw new Error(`SaveQuoteLineItem failed for ${row.supplier}`);
                    }
                } catch (errOne) {
                    fail += 1;
                    failedMsgs.push(errOne?.body?.message || errOne?.message || 'Unknown error');
                }
            }

            if (ok > 0 && fail === 0) {
                postToast = { title: 'Success', message: `Created ${ok} Quote Line Item(s).`, variant: 'success' };
                this.handleClearSelection();
            } else if (ok > 0 && fail > 0) {
                postToast = { title: 'Partial success', message: `Created ${ok}. Failed ${fail}.`, variant: 'warning' };
                console.warn('Failures:', failedMsgs.slice(0, 5));
            } else {
                postToast = { title: 'Failed', message: `All ${fail} item(s) failed to save.`, variant: 'error' };
                console.error('Failures:', failedMsgs);
            }
        } finally {
            this.loading = false;
            this.buildDateSections();
            if (postToast) this.showToast(postToast.title, postToast.message, postToast.variant);
        }
    };

    get headerCheckIn() {
        return this.formatDatePretty(this.filters.startDate);
    };
    get headerCheckOut() {
        if (this.filters.endDate) return this.formatDatePretty(this.filters.endDate);
        if (!this.filters.startDate) return '—';
        return this.formatDatePretty(
            this.computeEndDate(this.filters.startDate, this.filters.durationNights)
        );
    };
    get headerNights() {
        const n = this.filters.durationNights || '0';
        return `${n} (Nights)`;
    };
    get headerRooms() {
        const r = this.filters.quantityRooms || '0';
        return `${r} (Rooms)`;
    };

    get headerSupplierStatus() {
        if (!this.selectedSupplierStatuses || this.selectedSupplierStatuses.length === 0) {
            return 'Any';
        }
        return this.selectedSupplierStatuses.join(', ');
    };

    formatDatePretty(isoLike) {
        if (!isoLike) return '—';
        const d = new Date(isoLike);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    getEffectiveGroupFilters(crmCode) {
        const base = this.filters;
        const ui = (this.groups || []).find(g => g.crmCode === crmCode) || {};

        const ov = this.groupEdits[crmCode] || {};

        const startDate = ov.startDate ?? ui.uiStartDate ?? base.startDate ?? '';
        const durationNights = String(ov.durationNights ?? ui.uiDurationNights ?? base.durationNights ?? '1');
        const quantityRooms = String(ov.quantityRooms ?? ui.uiQuantityRooms ?? base.quantityRooms ?? '1');
        const starRating = ov.starRating ?? ui.uiStarRating ?? base.starRating ?? '';

        const endDate =
            (ov.endDate ?? ui.uiEndDate) ||
            (startDate ? this.computeEndDate(startDate, durationNights) : '');

        return { ...base, startDate, durationNights, quantityRooms, starRating, endDate };
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

        this.buildDateSections();

    };

    get headerText() {
        let parts = [];

        if (this.adults > 0) {
            parts.push(`${this.adults} Adult${this.adults > 1 ? 's' : ''}`);
        }
        if (this.children > 0) {
            parts.push(`${this.children} Child${this.children > 1 ? 'ren' : ''}`);
        }
        if (this.infants > 0) {
            parts.push(`${this.infants} Infant${this.infants > 1 ? 's' : ''}`);
        }

        if (parts.length === 0) {
            return 'Availability Search';
        }

        return `Availability Search for ${parts.join(' and ')}`;
    };

    getLocCodesForCrm(crm) {
        return [...new Set(
            (this.rows || [])
                .filter(r => r.crmCode === crm)
                .map(r => r.locCode)
                .filter(Boolean)
        )];
    };

    handleGroupSearch = async (e) => {
        const crm = e.currentTarget?.dataset?.crm;
        if (!crm) return;

        try {
            this.setGroupLoading(crm, true);

            const eff = this.getEffectiveGroupFilters(crm);
            const effStart = eff.startDate;
            const effNights = String(eff.durationNights || '1');
            const effRooms = String(eff.quantityRooms || this.filters.quantityRooms || '1');
            const effService = eff.serviceType || this.filters.serviceType || 'AC';

            if (!effStart || !effNights) {
                this.showToast('Missing dates', 'Please set Start Date and Nights for this hotel.', 'warning');
                return;
            }

            let locationCodes = this.getLocCodesForCrm(crm);
            if (!locationCodes.length) {
                locationCodes = await this.resolveLocationCodesForGroup(crm);
            }
            if (!locationCodes.length) {
                this.showToast('Pick a location',
                    'Please select a location (or run a global search) before using hotel-level search.',
                    'warning');
                return;
            }
            this.lastSelectedLocationCodes = Array.from(new Set([...(this.lastSelectedLocationCodes || []), ...locationCodes]));
            const locCode = locationCodes[0];

            const roomConfigs = this.buildApiRoomConfigs(effRooms);

            const records = [{
                Opt: `${locCode}${effService}${crm}??????`,
                Info: 'GSI',
                DateFrom: effStart,
                SCUqty: effNights,
                ButtonName: 'Accommodation',
                RoomConfigs: roomConfigs,
                MaximumOptions: 30
            }];

            const body = await getOptions({ reqPayload: JSON.stringify({ records }) });
            const raw = (typeof body === 'string') ? JSON.parse(body) : body;

            let newRows = this.transformApiData(raw).filter(r => r.crmCode === crm);

            newRows = newRows.filter(r => this.isOptAllowed(r.optId));

            newRows = this.applyDateContext(newRows, effStart, String(effNights));

            const groupStar = (this.groupEdits?.[crm]?.starRating || '').trim();
            const starsToFilter = groupStar ? [groupStar] : (this.selectedStarRatings || []);
            if (starsToFilter.length) {
                newRows = newRows.filter(row =>
                    starsToFilter.some(s => row.starRating && row.starRating.toLowerCase().includes(s.toLowerCase()))
                );
            }

            if ((this.selectedSupplierStatuses || []).length) {
                newRows = newRows.filter(r => this.selectedSupplierStatuses.includes(r.supplierStatus));
            }

            newRows = newRows.map(r => {
                const isSel = !!this.selectedKeys[r.uniqueKey];
                return {
                    ...r,
                    isSelected: isSel,
                    selectButtonClass: this.computeSelectClass(isSel)
                };
            });

            const sortItems = (arr) => arr.slice().sort((x, y) => {
                const s = (x.status || '').localeCompare(y.status || '');
                if (s !== 0) return s;
                const nx = Number((x.nett || '').replace(/[^\d]/g, '')) || 0;
                const ny = Number((y.nett || '').replace(/[^\d]/g, '')) || 0;
                return nx - ny;
            });
            const sorted = sortItems(newRows);

            const groupExists = (this.groups || []).some(g => g.crmCode === crm);
            if (!groupExists) {
                const supplierName = this.crmNameMap[crm] || crm;
                const ferret = this.ferretDestinations?.[crm] || '';
                const firstLocality = this.pickParentDestination(ferret) || ferret || '';
                const hdrEnd = effStart ? this.computeEndDate(effStart, effNights) : '';
                const newGroup = {
                    crmCode: crm,
                    supplier: supplierName,
                    items: [],
                    firstLocality,
                    ferretDestinationLocation: ferret || firstLocality,
                    uiStartDate: effStart || '',
                    uiEndDate: hdrEnd || '',
                    uiDurationNights: String(effNights || '1'),
                    uiQuantityRooms: String(effRooms || '1'),
                    uiStarRating: groupStar || '',
                    loading: false
                };
                this.groups = [...(this.groups || []), newGroup]
                    .sort((a, b) => (a.supplier || '').localeCompare(b.supplier || ''));

                if (!this.groupEdits[crm]) {
                    this.groupEdits = {
                        ...this.groupEdits,
                        [crm]: {
                            startDate: newGroup.uiStartDate,
                            durationNights: newGroup.uiDurationNights,
                            endDate: newGroup.uiEndDate,
                            quantityRooms: newGroup.uiQuantityRooms,
                            starRating: newGroup.uiStarRating
                        }
                    };
                }
            }

            this.groups = (this.groups || []).map(g => {
                if (g.crmCode !== crm) return g;

                const effHdr = this.getEffectiveGroupFilters(crm);
                return {
                    ...g,
                    items: sorted,
                    firstLocality: sorted.length ? sorted[0].locality : g.firstLocality,
                    uiStartDate: effHdr.startDate || '',
                    uiEndDate: effHdr.endDate || '',
                    uiDurationNights: String(effHdr.durationNights || '1'),
                    uiQuantityRooms: String(effHdr.quantityRooms || '1'),
                    uiStarRating: effHdr.starRating || ''
                };
            });

            this.buildDateSections();

            const others = (this.rows || []).filter(r => r.crmCode !== crm || r.dateKey !== newRows[0]?.dateKey);
            const ts = Date.now();
            const refreshedRows = sorted.map((r, i) => ({ ...r, id: `${r.uniqueKey}-${ts}-${i}` }));
            this.rows = [...others, ...refreshedRows];

        } catch (err) {
            const msg = (err && err.body && err.body.message) ? err.body.message : (err?.message || 'Unexpected error');
            this.showToast('Error', msg, 'error');
        } finally {
            this.setGroupLoading(crm, false);
        }
    };

    activateHeaderZ = (evt) => {
        const header = evt.currentTarget;
        header.classList.add('is-active');
    };

    deactivateHeaderZ = (evt) => {
        const header = evt.currentTarget;
        header.classList.remove('is-active');
    };

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    };
}
