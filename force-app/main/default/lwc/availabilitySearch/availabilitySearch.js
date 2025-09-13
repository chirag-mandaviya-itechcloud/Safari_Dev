import { LightningElement, track, api, wire } from 'lwc';
import { subscribe, unsubscribe, onError, setDebugFlag, isEmpEnabled } from 'lightning/empApi';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { getPicklistValues } from 'lightning/uiObjectInfoApi';
import getOptions from '@salesforce/apex/AvailabilitySearchController.getOptions';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getOptByOptCode from '@salesforce/apex/HotelController.getOptByOptCode';
import getLocationOptions from '@salesforce/apex/AvailabilitySearchController.getLocationOptions';
import getSelectedLocationsWithCodes from '@salesforce/apex/AvailabilitySearchController.getSelectedLocationsWithCodes';
import getFerretDestinationFromCrmCode from '@salesforce/apex/AvailabilitySearchController.getFerretDestinationFromCrmCode';
import getHotelsFromLocations from '@salesforce/apex/AvailabilitySearchController.getHotelsFromLocations';
import SaveQuoteLineItem from '@salesforce/apex/QuoteLineItemController.saveQuoteLineItem';
import getPassengerTypeCounts from '@salesforce/apex/HotelController.getPassengerTypeCounts';
import ACCOUNT_OBJECT from '@salesforce/schema/Account';
import ATTRACTIONS_FIELD from '@salesforce/schema/Account.Supplier_Activities_Attractions__c';
import getTravelDatesFromQuote from '@salesforce/apex/AvailabilitySearchController.getTravelDatesFromQuote';

const CURRENCY = 'ZAR';

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

    channelName = '/event/Hotel_Availability_Event__e';
    subscription = null;

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

    @track rows = [];
    @track groups = [];
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

    @track groupEdits = {};
    lastSelectedLocationCodes = [];
    @track starHeaderOptions = [];
    @track selectedKeys = {};
    ferretDestinations = {};
    @track dateSections = [];

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
        this.syncRoomsToQuantity(this.filters.quantityRooms);
    }

    disconnectedCallback() {
        this.teardownPeSubscription();
    }

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

    @wire(getFerretDestinationFromCrmCode, {})
    crmCodeToFerretDestinations({ data, error }) {
        if (data) {
            console.log('Retrieved Ferret Destinations: ', data);
            this.ferretDestinations = data;
        } else if (error) {
            console.error('Error retrieving Ferret Destinations: ', error);
        }
    }

    renderedCallback() {
        var locationComponent = this.template.querySelector('[role="cm-picklist"]');
        if (locationComponent != null && this.loadLoc) {
            locationComponent.setOptions(this.locationOptions);
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
            if (this.selectedSupplierStatuses.length > 0) {
                statusComponent.setSelectedList(this.selectedSupplierStatuses.join(';'));
            }
        }

        var attractionsComponent = this.template.querySelector('[role="attractions-picklist"]');
        if (attractionsComponent != null && this.loadAttractions) {
            attractionsComponent.setOptions(this.attractionsOptions);
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
            this.syncRoomsToQuantity(this.filters.quantityRooms);
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

    initPeSubscription() {
        try {
            setDebugFlag(true);

            onError((error) => {
                console.error('EMP API error: ', JSON.stringify(error));
            });

            // Subscribe for new events only (-1)
            subscribe(this.channelName, -1, this.handlePeMessage).then((resp) => {
                this.subscription = resp;
                console.log('Subscribed to PE channel', JSON.stringify(resp));
            });
        } catch (e) {
            // console.error('PE subscribe failed', e);
        }
    }

    teardownPeSubscription() {
        try {
            if (this.subscription) {
                unsubscribe(this.subscription, () => {
                    console.log('Unsubscribed from PE channel');
                });
                this.subscription = null;
            }
        } catch (e) {
            // console.error('PE unsubscribe failed', e);
        }
    }

    handlePeMessage = (message) => {
        console.log('PE message received: ', message);
        try {
            const payload = message?.data?.payload || {};

            console.log('PE Request:', payload.Request_JSON__c);
            console.log('PE Hotel JSON:', payload.Hotel_JSON__c);
            console.log('PE Quote Id:', payload.Quote_Id__c);
            console.log('PE Start Date :', payload.Start_Date__c);
            console.log('PE End Date :', payload.End_Date__c);

            const quoteIdFromPe = payload.Quote_Id__c;

            // Only process events for this LWC's record
            if (!quoteIdFromPe || quoteIdFromPe !== this.recordId) return;

            let raw;
            if (payload.Hotel_JSON__c) {
                try { raw = JSON.parse(payload.Hotel_JSON__c); } catch { return; }
            } else {
                raw = payload;
            }
            // console.log("Raw from PE:", raw);

            this.appendResultsFromRaw(raw, "Agent", {
                peStart: payload.Start_Date__c || '',
                peEnd: payload.End_Date__c || ''
            });
        } catch (e) {
            console.error('handlePeMessage error', e);
        }
    };

    appendResultsFromRaw(raw, source, meta = { peStart: '', peEnd: '' }) {
        const fetchedRows = this.transformApiData(raw);

        if (!this.lastSelectedLocationCodes || this.lastSelectedLocationCodes.length === 0) {
            const derived = [...new Set(fetchedRows.map(r => r.locCode).filter(Boolean))];
            if (derived.length > 0) this.lastSelectedLocationCodes = derived;
        }

        let filtered = fetchedRows;
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
                    // overwrite this hotel's header to PE dates every time it appears in a PE
                    ...this.groupEdits[crm],
                    startDate,
                    durationNights,
                    endDate
                };
            });
        }

        // Normalize new rows: unique id + preserve selection state
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

        const existingBySelKey = new Map((this.rows || []).map(r => [r.selKey, r]));
        for (const nr of normalizedNew) {
            if (!existingBySelKey.has(nr.selKey)) {
                existingBySelKey.set(nr.selKey, nr);
            }
        }
        const mergedRows = Array.from(existingBySelKey.values());

        this.rows = mergedRows;
        this.groups = this.groupBySupplier(mergedRows);

        this.buildDateSections();

        this.hasSearched = true;
    }

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

    computeNights(startIso, endIso) {
        if (!startIso || !endIso) return '';
        const s = new Date(`${startIso}T00:00:00`);
        const e = new Date(`${endIso}T00:00:00`);
        const days = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
        const nights = Math.max(1, days); // checkout = start + nights + 1
        return String(nights);
    }

    makeDateKey(startIso, endIso) {
        const s = startIso || '';
        const e = endIso || '';
        return `${s}|${e}`; // stable key to bucket groups
    }

    formatRangeTitle(startIso, endIso) {
        if (!startIso || !endIso) return 'No dates';
        const s = new Date(`${startIso}T00:00:00`);
        const e = new Date(`${endIso}T00:00:00`);
        if (isNaN(s) || isNaN(e)) return 'No dates';

        // Examples: "11–15 Sep 2025" if same month/year
        // Otherwise: "28 Sep – 02 Oct 2025"
        const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();

        const day = (d) => d.toLocaleDateString('en-GB', { day: '2-digit' });
        const mon = (d) => d.toLocaleDateString('en-GB', { month: 'short' });
        const yr = (d) => d.getFullYear();

        if (sameMonth) {
            return `${day(s)}-${day(e)} ${mon(e)} ${yr(e)}`;
        }
        return `${day(s)} ${mon(s)} - ${day(e)} ${mon(e)} ${yr(e)}`;
    }

    buildDateSections() {
        const buckets = new Map(); // key -> { key, start, end, title, groups: [], parentDests: Set }

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

            const sec = buckets.get(key);
            sec.groups.push(g);

            // Use your normalized ferret destination, fallback to firstLocality
            const rawDest = (g.ferretDestinationLocation || g.firstLocality || '').trim();
            const parent = this.pickParentDestination(rawDest);
            if (parent) sec.parentDests.add(parent);
        });

        // Sort sections by start/end date; empty/no-date last
        const parse = (iso) => (iso ? Date.parse(`${iso}T00:00:00`) : Number.POSITIVE_INFINITY);
        const sections = Array.from(buckets.values())
            .sort((a, b) => {
                const sa = parse(a.start), sb = parse(b.start);
                if (sa !== sb) return sa - sb;
                const ea = parse(a.end), eb = parse(b.end);
                return ea - eb;
            })
            .map(sec => {
                const list = Array.from(sec.parentDests).sort((x, y) => x.localeCompare(y));

                // Build a readable label:
                // 1 item  -> "Kruger National Park"
                // 2-3     -> "A, B"
                // 4+      -> "A, B +2 more"
                let destLabel = '';
                if (list.length === 1) destLabel = list[0];
                else if (list.length === 2) destLabel = `${list[0]}, ${list[1]}`;
                else if (list.length === 3) destLabel = `${list[0]}, ${list[1]}, ${list[2]}`;
                else if (list.length >= 4) destLabel = `${list[0]}, ${list[1]} +${list.length - 2} more`;

                return { ...sec, destLabel };
            });

        this.dateSections = sections;
    }


    normalizeDestinationParts(str) {
        if (!str) return [];
        // supports "A | B | C" and "A, B, C" just in case
        return String(str)
            .split(/\s*\|\s*|\s*,\s*/g)
            .map(s => s.trim())
            .filter(Boolean);
    }

    pickParentDestination(str) {
        const parts = this.normalizeDestinationParts(str);
        if (parts.length >= 3) return parts[parts.length - 2]; // parent above country
        if (parts.length === 2) return parts[0];                // region above country
        return parts[0] || '';
    }




    handleInput = (e) => {
        const { name, value } = e.target;
        console.log(`Changed ${name} : ${value}`);

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
    }

    syncRoomsToQuantity(qty) {
        const n = Math.max(1, parseInt(qty, 10) || 1);
        let rooms = [...(this.roomConfigs || [])];
        const oldLen = rooms.length;

        // grow/shrink
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
                Infants: parseInt(r.infants) || 0,
                RoomType: 'TW'
            }
        }));
    }

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
    }

    computeEndDate(startIso, nights) {
        if (!startIso) return '';
        const n = parseInt(nights, 10);
        const nightsInt = Number.isFinite(n) ? n : 0;

        // End date = start + nights + 1 day (your requirement)
        const d = new Date(`${startIso}T00:00:00`); // anchor to midnight to avoid TZ surprises
        d.setDate(d.getDate() + nightsInt + 1);

        return d.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    sumRooms(rooms = this.roomConfigs) {
        return rooms.reduce((a, r) => {
            a.adults += parseInt(r.adults) || 0;
            a.children += parseInt(r.children) || 0;
            a.infants += parseInt(r.infants) || 0;
            return a;
        }, { adults: 0, children: 0, infants: 0 });
    }

    validateRoomTotals(rooms = this.roomConfigs) {
        const s = this.sumRooms(rooms);
        if (s.adults > (this.adults || 0)) {
            this.showToast('Too many adults',
                `You entered ${s.adults}, but the quote has ${this.adults} adult${this.adults === 1 ? '' : 's'}.`,
                'error');
            return false;
        }
        if (s.children > (this.children || 0)) {
            this.showToast('Too many children',
                `You entered ${s.children}, but the quote has ${this.children} ${this.children === 1 ? 'child' : 'children'}.`,
                'error');
            return false;
        }
        if (s.infants > (this.infants || 0)) {
            this.showToast('Too many infants',
                `You entered ${s.infants}, but the quote has ${this.infants} infant${this.infants === 1 ? '' : 's'}.`,
                'error');
            return false;
        }
        return true;
    }

    validateRoomTotalsExact(rooms = this.roomConfigs) {
        const s = this.sumRooms(rooms);
        const mismatch =
            s.adults !== (this.adults || 0) ||
            s.children !== (this.children || 0) ||
            s.infants !== (this.infants || 0);

        if (mismatch) {
            this.showToast(
                'Room totals must match quote',
                `Entered A/C/I = ${s.adults}/${s.children}/${s.infants}; ` +
                `Quote A/C/I = ${this.adults}/${this.children}/${this.infants}.`,
                'error'
            );
            return false;
        }
        return true;
    }

    async handleSearch() {
        this.loading = true;
        this.error = undefined;

        // Required field validation
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
                        ButtonName: 'Accommodation',
                        RoomConfigs: roomConfigs,
                        MaximumOptions: 30
                    });
                });
            });

            const requestPayload = { records: payloads };
            console.log('Request payload:', JSON.stringify(requestPayload));
            const body = await getOptions({ reqPayload: JSON.stringify(requestPayload) });
            const raw = (typeof body === 'string') ? JSON.parse(body) : body;

            this.appendResultsFromRaw(raw, "Search");
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
            locCode: this.extractLoc(optMeta.optId)
        };
    }

    // Add this helper inside the class
    async resolveLocationCodesForGroup(crm) {
        // 1) If we already have them from a previous global search, use them.
        if (this.lastSelectedLocationCodes && this.lastSelectedLocationCodes.length) {
            return [...this.lastSelectedLocationCodes];
        }

        // 2) If the user has selected locations in the multi-select, resolve those.
        if (this.selectedLocations && this.selectedLocations.length) {
            const locs = await getSelectedLocationsWithCodes({
                locationIds: this.selectedLocations.map(l => l.value)
            });
            return (locs || []).map(l => l.LOC_Name__c);
        }

        // 3) Fallback: infer from the current group’s first locality label.
        const grp = (this.groups || []).find(g => g.crmCode === crm);
        const firstLocality = (grp && grp.firstLocality) ? grp.firstLocality.trim().toLowerCase() : '';
        if (firstLocality) {
            // match the displayed locality to the loaded location options (case-insensitive)
            const match = (this.locationOptions || []).find(
                o => (o.label || '').trim().toLowerCase() === firstLocality
            );
            if (match) {
                const locs = await getSelectedLocationsWithCodes({ locationIds: [match.value] });
                return (locs || []).map(l => l.LOC_Name__c);
            }
        }

        // Nothing found
        return [];
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

    handleRowCheckboxChange = (e) => {
        const rowKey = e.target.dataset.rowKey;
        const checked = e.target.checked;

        this.selectedKeys = { ...this.selectedKeys, [rowKey]: checked };

        // reflect in flat rows
        this.rows = (this.rows || []).map(r =>
            r.selKey === rowKey ? { ...r, isSelected: checked } : r
        );

        // reflect in grouped rows
        this.groups = (this.groups || []).map(g => ({
            ...g,
            items: g.items.map(it =>
                it.selKey === rowKey ? { ...it, isSelected: checked } : it
            )
        }));
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
    };

    extractCrm(optId) {
        if (!optId || optId.length < 11) return '';
        return optId.substring(5, 11);
    }

    extractLoc(optId) {
        if (!optId || optId.length < 3) return '';
        return optId.substring(0, 3);
    }


    groupBySupplier(rows) {
        const map = new Map();
        rows.forEach(r => {
            const key = r.crmCode || '—';
            if (!map.has(key)) map.set(key, { crmCode: key, supplier: r.supplier || '—', items: [] });
            map.get(key).items.push(r);
        });

        const sortItems = (arr) => arr.slice().sort((x, y) => {
            const s = (x.status || '').localeCompare(y.status || '');
            if (s !== 0) return s;
            const nx = Number((x.nett || '').replace(/[^\d]/g, '')) || 0;
            const ny = Number((y.nett || '').replace(/[^\d]/g, '')) || 0;
            return nx - ny;
        });

        const prevLoading = new Map((this.groups || []).map(g => [g.crmCode, !!g.loading]));

        const groups = Array.from(map.values())
            .sort((a, b) => a.supplier.localeCompare(b.supplier))
            .map(g => {
                // Prefer groupEdits (set by PE or user). If not set yet, use globals.
                const ge = this.groupEdits[g.crmCode] || {};
                const start = ge.startDate ?? this.filters.startDate ?? '';
                const nights = String(ge.durationNights ?? this.filters.durationNights ?? '1');
                const end = start ? (ge.endDate ?? this.computeEndDate(start, nights)) : '';
                const firstLocality = g.items.length > 0 ? g.items[0].locality : '';

                let ferretDestinationLocation = this.ferretDestinations[g.crmCode];
                if (!ferretDestinationLocation) {
                    ferretDestinationLocation = firstLocality;
                }

                return {
                    ...g,
                    items: sortItems(g.items),
                    firstLocality,
                    ferretDestinationLocation,
                    uiStartDate: start || '',
                    uiEndDate: end || '',
                    uiDurationNights: nights,
                    uiQuantityRooms: String(ge.quantityRooms ?? this.filters.quantityRooms ?? '1'),
                    uiStarRating: ge.starRating ?? this.filters.starRating ?? '',
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
        const val = n / 100;
        return `${CURRENCY}${val.toLocaleString()}`;
    }

    get showNoHotels() {
        return this.hasSearched && !this.loading && !this.error && (!this.groups || this.groups.length === 0);
    }

    handleSaveSelected = async () => {
        const selected = (this.rows || []).filter(r => !!this.selectedKeys[r.selKey] && !r.addDisabled);
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
                    const eff = this.getEffectiveGroupFilters(row.crmCode);

                    const selectedOPT = await getOptByOptCode({ optCode: row.optId });
                    if (!selectedOPT || !selectedOPT[0]) {
                        throw new Error(`OPT not found for ${row.optId}`);
                    }

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
                        serviceDate: eff.startDate,
                        numberOfDays: String(eff.durationNights),
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
                    console.log("Saving QLI with params:", params);

                    const result = await SaveQuoteLineItem(params);

                    if (Array.isArray(result) && result.length === 0) {
                        ok += 1;
                        const k = row.selKey;
                        const newSel = { ...this.selectedKeys };
                        delete newSel[k];
                        this.selectedKeys = newSel;

                        this.rows = (this.rows || []).map(r =>
                            r.selKey === k ? { ...r, isSelected: false, selectButtonClass: this.computeSelectClass(false) } : r
                        );
                        this.groups = (this.groups || []).map(g => ({
                            ...g,
                            items: g.items.map(it =>
                                it.selKey === k ? { ...it, isSelected: false, selectButtonClass: this.computeSelectClass(false) } : it
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
            if (postToast) this.showToast(postToast.title, postToast.message, postToast.variant);
        }
    };

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
        if (!this.selectedSupplierStatuses || this.selectedSupplierStatuses.length === 0) {
            return 'Any';
        }
        return this.selectedSupplierStatuses.join(', ');
    }

    get headerStarRating() {
        const r = { '': 'Any', '5 Star': '5 Star', '4 Star': '4 Star', '3 Star': '3 Star' }
        return r[this.filters.starRating ?? ''] || '-';
    }

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

        console.log('Group edits:', this.groupEdits);
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

    getLocCodesForCrm(crm) {
        return [...new Set(
            (this.rows || [])
                .filter(r => r.crmCode === crm)
                .map(r => r.locCode)
                .filter(Boolean)
        )];
    }



    // REFACTORED: per-hotel (group) search — reliable for PE + manual data
    handleGroupSearch = async (e) => {
        const crm = e.currentTarget?.dataset?.crm;
        if (!crm) return;

        console.log(`Searching for hotel group ${crm}…`);

        // handy local setter so the "Searching…" label toggles correctly
        const setLoading = (val) => {
            this.groups = (this.groups || []).map(g =>
                g.crmCode === crm ? { ...g, loading: !!val } : g
            );
        };

        try {
            setLoading(true);

            // 1) Use effective values (global filters + per-group overrides)
            const eff = this.getEffectiveGroupFilters(crm); // merges this.filters with this.groupEdits[crm]
            const effStart = eff.startDate;
            const effNights = String(eff.durationNights || '1');
            const effRooms = String(eff.quantityRooms || this.filters.quantityRooms || '1');
            const effService = eff.serviceType || this.filters.serviceType || 'AC';

            // Validate required inputs for this hotel
            if (!effStart || !effNights) {
                this.showToast('Missing dates', 'Please set Start Date and Nights for this hotel.', 'warning');
                return;
            }

            // 2) Resolve location code(s) for this CRM/hotel.
            //    Prefer: existing rows → cached codes → selected locations → derive from locality.
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
            // Cache for future calls and choose the first (engine expects a single loc per CRM search)
            this.lastSelectedLocationCodes = Array.from(new Set([...(this.lastSelectedLocationCodes || []), ...locationCodes]));
            const locCode = locationCodes[0];

            // 3) Build room configs honoring the group’s "Rooms" override
            const roomConfigs = this.buildApiRoomConfigs(effRooms);

            // 4) Build request and call the engine
            const records = [{
                Opt: `${locCode}${effService}${crm}??????`,
                Info: 'GSI',
                DateFrom: effStart,
                SCUqty: effNights,
                ButtonName: 'Accommodation',
                RoomConfigs: roomConfigs,
                MaximumOptions: 30
            }];

            console.log(`Group search payload for ${crm}:`, { records });

            const body = await getOptions({ reqPayload: JSON.stringify({ records }) });
            const raw = (typeof body === 'string') ? JSON.parse(body) : body;

            // 5) Transform to rows, keep ONLY items for this CRM
            let newRows = this.transformApiData(raw).filter(r => r.crmCode === crm);

            // if (this.filters.liveAvailability === 'OK') {
            //     newRows = newRows.filter(r => r.status === 'Available');
            // } else if (this.filters.liveAvailability === 'RQ') {
            //     newRows = newRows.filter(r => r.status === 'On Request');
            // }

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

            // 7) Preserve selection state and stable keys
            newRows = newRows.map(r => {
                const isSel = !!this.selectedKeys[r.selKey];
                return {
                    ...r,
                    isSelected: isSel,
                    selectButtonClass: this.computeSelectClass(isSel)
                };
            });

            // 8) Sort the rows in the same way as groupBySupplier() does
            const sortItems = (arr) => arr.slice().sort((x, y) => {
                const s = (x.status || '').localeCompare(y.status || '');
                if (s !== 0) return s;
                const nx = Number((x.nett || '').replace(/[^\d]/g, '')) || 0;
                const ny = Number((y.nett || '').replace(/[^\d]/g, '')) || 0;
                return nx - ny;
            });
            const sorted = sortItems(newRows);

            // 9) Update this GROUP ONLY (keeps other groups intact)
            this.groups = (this.groups || []).map(g => {
                if (g.crmCode !== crm) return g;

                // Make sure the header shows effective values (so PE/global values appear even before edits)
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

            // 10) Refresh the flat rows for this CRM only (others unchanged)
            const others = (this.rows || []).filter(r => r.crmCode !== crm);
            const ts = Date.now();
            const refreshedRows = sorted.map((r, i) => ({ ...r, id: `${crm}-${i}-${ts}` }));
            this.rows = [...others, ...refreshedRows];

            console.log("result : ", newRows);

        } catch (err) {
            const msg = (err && err.body && err.body.message) ? err.body.message : (err?.message || 'Unexpected error');
            this.showToast('Error', msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    activateHeaderZ = (evt) => {
        // the header row itself is the currentTarget in our handler
        const header = evt.currentTarget;
        header.classList.add('is-active');
    };

    deactivateHeaderZ = (evt) => {
        const header = evt.currentTarget;
        header.classList.remove('is-active');
    };


    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
