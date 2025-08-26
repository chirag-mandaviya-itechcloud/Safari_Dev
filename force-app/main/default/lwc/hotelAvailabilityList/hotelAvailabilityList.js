import { LightningElement, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { subscribe, onError } from 'lightning/empApi';
import getOptsByCrmCode from '@salesforce/apex/HotelController.getOptsByCrmCode';
import getOptByOptCode from '@salesforce/apex/HotelController.getOptByOptCode';
import getPassengerTypeCounts from '@salesforce/apex/HotelController.getPassengerTypeCounts';
import SaveQuoteLineItem from '@salesforce/apex/QuoteLineItemController.saveQuoteLineItem';

export default class HotelAvailabilityList extends NavigationMixin(LightningElement) {
    @track roomType = 'DOUBLE AVAIL';
    @track numAdults = 0;
    @track numChildren = 0;
    @track numInfants = 0;
    @track numRooms = 1;
    @track roomConfigs = [
        { roomType: 'DOUBLE AVAIL', adults: 0, children: 0, infants: 0 }
    ];
    @track passengerCounts = {
        Adult: 0,
        Child: 0,
        Infant: 0
    };


    @track groupedHotels = [];
    @api recordId = '';
    subscription = {};
    channelName = '/event/Hotel_Availability_Event__e';
    @track isLoading = false;


    connectedCallback() {
        this.registerErrorListener();
        this.handleSubscribe();
        this.initializeDefaultRooms();
        this.loadPassengerCounts();
    }

    async handleSubscribe() {
        const messageCallback = async (response) => {
            const payload = response.data.payload;
            if (payload.Hotel_JSON__c) {
                const hotelList = JSON.parse(payload.Hotel_JSON__c);
                const hotelListValues = Object.values(hotelList);
                const filteredHotelList = hotelListValues.filter(hotel => hotel.quoteId === this.recordId);
                console.log("Filtered Hotel List: ", filteredHotelList);

                if (filteredHotelList.length === 0) {
                    console.log('No hotels match this Quote Id');
                    return;
                }

                const startDateObj = new Date(filteredHotelList[0].startDate);
                const endDateObj = new Date(filteredHotelList[0].endDate);
                const durationDays = Math.floor((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));

                const newHotels = await Promise.all(filteredHotelList.map(async hotel => {

                    const rates = this.buildRates(hotel);
                    const isAvailable = hotel.availability === 'Available' && rates.length > 0;

                    return {
                        hotelName: hotel.hotelName,
                        accountId: hotel.accountId,
                        crmCode: hotel.crmCode,
                        optId: hotel.optId,
                        // UI fields
                        area: 'Downtown District',
                        imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945',
                        facilities: ['WiFi', 'Pool', 'Gym'],
                        rating: 4.2,

                        // Availability & rates (NEW)
                        availability: hotel.availability,
                        isAvailable: isAvailable,
                        rates: rates,                 // [{ rateText, totalPrice, ... }]
                        showRates: false,
                        iconName: 'utility:chevronright',

                        // Keep these for compatibility; we no longer display them anywhere
                        pricePerNight: null,
                        totalPrice: null,

                        // existing flags
                        variant: 'neutral',
                        selected: false,

                        // keys
                        detailsRowKey: hotel.hotelName + '_details'
                    };
                }));


                const startDate = filteredHotelList[0].startDate;
                const endDate = filteredHotelList[0].endDate;

                let groupFound = false;

                // Check if a group already exists for these dates
                this.groupedHotels = this.groupedHotels.map(group => {
                    if (group.startDate === startDate && group.endDate === endDate) {
                        groupFound = true;

                        // Add only hotels that don't already exist in the group (based on crmCode)
                        const existingCrmCodes = group.hotels.map(h => h.crmCode);
                        const filteredNewHotels = newHotels.filter(hotel => !existingCrmCodes.includes(hotel.crmCode));

                        group.hotels = [...group.hotels, ...filteredNewHotels];
                    }
                    return group;
                });

                if (!groupFound) {
                    const newGroup = {
                        durationId: this.groupedHotels.length + 1,
                        durationDays: durationDays,
                        startDate: startDate,
                        endDate: endDate,
                        hotels: newHotels
                    };

                    this.groupedHotels = [...this.groupedHotels, newGroup];
                    this.groupedHotels.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
                }

            }
        };

        subscribe(this.channelName, -1, messageCallback).then((response) => {
            this.subscription = response;
        });
    }

    handleToggleRates(event) {
        const groupId = parseInt(event.target.dataset.groupId, 10);
        const hotelIndex = parseInt(event.target.dataset.index, 10);

        this.groupedHotels = this.groupedHotels.map(group => {
            if (group.durationId === groupId) {
                group.hotels = group.hotels.map((hotel, idx) => {
                    if (idx === hotelIndex) {
                        if (!hotel.isAvailable) return hotel; // do nothing if not available
                        hotel.showRates = !hotel.showRates;
                        hotel.iconName = hotel.showRates ? 'utility:chevrondown' : 'utility:chevronright';
                    }
                    return hotel;
                });
            }
            return group;
        });
    }

    handleSelectRate(event) {
        const groupId = parseInt(event.target.dataset.groupId, 10);
        const hotelIndex = parseInt(event.target.dataset.hotelIndex, 10);
        const rateIndex = parseInt(event.target.dataset.rateIndex, 10);

        this.groupedHotels = this.groupedHotels.map(group => {
            if (group.durationId === groupId) {
                group.hotels = group.hotels.map((hotel, hIdx) => {
                    hotel.rates = (hotel.rates || []).map((rate, rIdx) => {
                        const selected = (hIdx === hotelIndex && rIdx === rateIndex);
                        rate.selected = selected;
                        rate.variant = selected ? 'success' : 'neutral';
                        return rate;
                    });
                    return hotel;
                });
            }
            return group;
        });
    }

    handleClear() {
        this.groupedHotels = [];
    }

    get hasHotels() {
        return this.groupedHotels.length > 0;
    }

    get roomQuantityOptions() {
        return Array.from({ length: 20 }, (_, i) => {
            const num = i + 1;
            return { label: num.toString(), value: num.toString() };
        });
    }

    get numRoomsString() {
        return this.numRooms.toString();
    }

    initializeDefaultRooms() {
        this.numRooms = 1;
        this.roomConfigs = [{
            id: 'room_1',
            displayLabelRoom: 'Room 1',
            roomType: 'DOUBLE AVAIL',
            adults: 0,
            children: 0,
            infants: 0,
            passengers: 0
        }];
    }

    async loadPassengerCounts() {
        try {
            const result = await getPassengerTypeCounts({ quoteId: this.recordId });
            this.passengerCounts = result;
        } catch (error) {
            console.error('Error loading passenger counts:', error);
        }
    }

    // Build "rates" from availabilityResults
    buildRates(hotel) {
        if (Array.isArray(hotel.availabilityResults)) {
            return hotel.availabilityResults.map((r, idx) => {
                const cents = Number(r.totalPrice);
                const amount = Number.isFinite(cents) ? cents / 100 : null;
                const code = (r.currencyName || '').toUpperCase();

                return {
                    id: `${hotel.crmCode}_${idx}`,
                    rateText: r.rateText,
                    availability: r.availability || '',
                    currencyName: code,   // used by lightning-formatted-number
                    totalPriceCents: cents,
                    amount,
                    selected: false,
                    variant: 'neutral',
                    optId: r.OptId || ''
                };
            });
        }
        return [];
    }

    // Pick the best (lowest) total price from availabilityResults
    getBestPriceFromResults(hotel) {
        if (
            hotel?.availability === 'Available' &&
            Array.isArray(hotel.availabilityResults) &&
            hotel.availabilityResults.length
        ) {
            const nums = hotel.availabilityResults
                .map(r => Number(r.totalPrice))
                .filter(n => Number.isFinite(n) && n > 0);
            if (nums.length) {
                const best = Math.min(...nums);
                const currency = hotel.availabilityResults.find(r => r.currencyName)?.currencyName || 'USD';
                return { bestTotalPrice: best, currencyName: currency };
            }
        }
        return { bestTotalPrice: null, currencyName: '' };
    }

    get quoteAdultCount() {
        return this.passengerCounts?.Adult || 0;
    }

    get quoteChildCount() {
        return this.passengerCounts?.Child || 0;
    }

    get quoteInfantCount() {
        return this.passengerCounts?.Infant || 0;
    }



    // Handle room quantity change
    handleRoomQuantityChange(event) {
        const newCount = parseInt(event.detail.value, 10);
        if (!newCount || newCount < 1) {
            this.roomConfigs = [];
            return;
        }

        this.numRooms = newCount;
        this.roomConfigs = Array.from({ length: newCount }, (_, i) => {
            const existing = this.roomConfigs[i] || {};
            return {
                id: `room_${i + 1}`,
                displayLabelRoom: `Room ${i + 1}`,
                roomType: existing.roomType || 'DOUBLE AVAIL',
                adults: existing.adults || 0,
                children: existing.children || 0,
                infants: existing.infants || 0,
                passengers: (existing.adults || 0) + (existing.children || 0) + (existing.infants || 0)
            };
        });
    }

    // Handle individual room inputs
    handleRoomInputChange(event) {
        const index = parseInt(event.target.dataset.index, 10);
        const field = event.target.name;
        const value = field === 'roomType' ? event.detail.value : parseInt(event.detail.value, 10) || 0;

        const updatedRooms = [...this.roomConfigs];
        const room = { ...updatedRooms[index] };

        room[field] = value;

        room.passengers = parseInt(room.adults || 0) + parseInt(room.children || 0) + parseInt(room.infants || 0);

        updatedRooms[index] = room;
        this.roomConfigs = updatedRooms;

        let totalAdults = 0, totalChildren = 0, totalInfants = 0;

        this.roomConfigs.forEach(room => {
            totalAdults += parseInt(room.adults || 0);
            totalChildren += parseInt(room.children || 0);
            totalInfants += parseInt(room.infants || 0);
        });

        const maxAdults = this.passengerCounts['Adult'] || 0;
        const maxChildren = this.passengerCounts['Child'] || 0;
        const maxInfants = this.passengerCounts['Infant'] || 0;

        if (totalAdults > maxAdults) {
            this.validationError = '* You have exceeded the allowed number of Adult passengers.';
        } else if (totalChildren > maxChildren) {
            this.validationError = '* You have exceeded the allowed number of Child passengers.';
        } else if (totalInfants > maxInfants) {
            this.validationError = '* You have exceeded the allowed number of Infant passengers.';
        } else {
            this.validationError = '';
        }

    }

    get roomTypeOptions() {
        return [
            { label: 'SINGLE AVAIL', value: 'SINGLE AVAIL' },
            { label: 'DOUBLE AVAIL', value: 'DOUBLE AVAIL' },
            { label: 'TWIN AVAIL', value: 'TWIN AVAIL' }
        ];
    }

    async handleSave() {
        this.isLoading = true;

        if (this.validationError) {
            this.showToast('Error', this.validationError, 'error');
            this.isLoading = false;
            return;
        }

        let groupFound = false;
        let allResults = [];

        for (const group of this.groupedHotels) {
            const selectedHotel = group.hotels.find(hotel =>
                hotel.rates.some(rate => rate.selected)
            );

            if (!selectedHotel) {
                console.warn(`No hotel selected in group starting ${group.startDate}`);
                continue;
            }

            const selectedRate = selectedHotel.rates.find(rate => rate.selected);

            console.log(`Selected Rate for hotel "${selectedHotel.hotelName}"`, selectedRate);

            // get here OPT record for create QuoteLineItem
            const selectedOPT = await getOptByOptCode({ optCode: selectedRate.optId });
            console.log(`Selected OPT for hotel "${selectedHotel.hotelName}"`, selectedOPT);

            if (!selectedOPT || !selectedOPT[0].ExternalId__c) {
                console.warn(`Skipping hotel "${selectedHotel.hotelName}" due to missing selected Rate or ExternalId__c`);
                continue;
            }

            groupFound = true;

            const roomConfigurations = this.roomConfigs.map((room, i) => ({
                id: i + 1,
                serviceType: 'Accommodation',
                serviceSubtype: room.roomType,
                adults: room.adults,
                children: room.children,
                infants: room.infants,
                passengers: room.adults + room.children + room.infants,
                quoteLineItemId: null,
                order: i + 1
            }));

            const params = {
                serviceLineItemName: selectedHotel.hotelName,
                selectedServiceType: selectedOPT[0].SRV_Name__c,
                selectedLocation: selectedOPT[0].LOC_Name__c,
                selectedSupplierName: selectedHotel.hotelName,
                selectedSupplierId: selectedOPT[0].CRM_Lookup__c,
                selectedServiceDetail: `${selectedOPT[0].Description__c} || ${selectedOPT[0].Comment__c}`,
                selectedServiceDetailDisplayName: `${selectedOPT[0].Description__c} || ${selectedOPT[0].Comment__c}`,
                quoteLineItemId: 'newitem',
                serviceClientNotes: '',
                serviceReservationNumber: '',
                serviceSelectServiceStatus: 'Not Booked',
                serviceExpiryDate: '',
                overrideDetails: false,
                overridenSupplierPolicy: true,// Made these true to over ride passenger configuration
                selectedPassengers: [],
                serviceDate: group.startDate,
                numberOfDays: group.durationDays.toString(),
                displayDuration: group.durationDays.toString(),
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

            console.log('Prepared params for SaveQuoteLineItem:', params);

            try {
                console.log(`Saving Quote Line Item for "${selectedHotel.hotelName}" with params:`, params);
                const result = await SaveQuoteLineItem(params);
                // const result = await SaveQuoteLineItem({
                //     serviceLineItemName: params.serviceLineItemName,
                //     selectedServiceType: params.selectedServiceType,
                //     selectedLocation: params.selectedLocation,
                //     selectedSupplierName: params.selectedSupplierName,
                //     selectedSupplierId: params.selectedSupplierId,
                //     selectedServiceDetail: params.selectedServiceDetail,
                //     selectedServiceDetailDisplayName: params.selectedServiceDetailDisplayName,
                //     quoteLineItemId: params.quoteLineItemId,
                //     serviceClientNotes: params.serviceClientNotes,
                //     serviceReservationNumber: params.serviceReservationNumber,
                //     serviceSelectServiceStatus: params.serviceSelectServiceStatus,
                //     serviceExpiryDate: params.serviceExpiryDate,
                //     overrideDetails: params.overrideDetails,
                //     overridenSupplierPolicy: params.overridenSupplierPolicy,
                //     selectedPassengers: params.selectedPassengers,
                //     serviceDate: params.serviceDate,
                //     numberOfDays: params.numberOfDays,
                //     displayDuration: params.displayDuration,
                //     quoteId: params.quoteId,
                //     roomConfigurations: params.roomConfigurations,
                //     logistics: params.logistics,
                //     flightDetail: params.flightDetail,
                //     oldChargeTypes: params.oldChargeTypes,
                //     keepRatesOnDateChange: params.keepRatesOnDateChange,
                //     selectedOPT: params.selectedOPT,
                //     addOns: params.addOns,
                //     serviceInclusionNote: params.serviceInclusionNote,
                //     serviceExclusionNote: params.serviceExclusionNote,
                //     supplierDescription: params.supplierDescription,
                //     serviceDescription: params.serviceDescription
                // });
                allResults.push(...(result || []));
                console.log('Result from SaveQuoteLineItem:', result);
            } catch (error) {
                console.error(`Error saving for "${selectedHotel.hotelName}": `, error);
                allResults.push(error.message || 'Unknown error');
            }
        }

        if (!groupFound) {
            this.showToast('Warning', 'Please select one OPT per part before saving.', 'warning');
            this.isLoading = false;
        } else {
            if (allResults.length === 0) {
                this.isLoading = false;
                this.showToast('Success', 'All selected Quote Line Items saved successfully.', 'success');
                // Delay to show the toast, then reload the page
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else {
                this.isLoading = false;
                this.showToast('Error', `Errors occurred: ${allResults.join(', ')} `, 'error');
            }
        }

    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    registerErrorListener() {
        onError((error) => {
            console.error('Platform event error: ', JSON.stringify(error));
        });
    }
}
