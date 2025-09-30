public class GetTravelInformationFromQuote {
    public class TravelInformationResponse {
        @InvocableVariable
        public Date startDate;

        @InvocableVariable
        public Date endDate;

        @InvocableVariable
        public Decimal totalPassengers;

        @InvocableVariable
        public Integer numberOfAdults;

        @InvocableVariable
        public Integer numberOfChildren;

        @InvocableVariable
        public String countryOfInterest;
        
		@InvocableVariable
        public String regionOfInterest;
        
        @InvocableVariable
        public String activitiesOfInterest;
        
        @InvocableVariable
        public String levelOfAccommodation;
        
        @InvocableVariable
        public Decimal totalBudget;
        
        @InvocableVariable
        public Id accountId;
        
        @InvocableVariable
        public Id opportunityId;
    }

    public class QuoteRequest {
        @InvocableVariable(required=true)
        public Id quoteId;
    }

    @InvocableMethod(label='Get Travel Information from Quote')
    public static List<TravelInformationResponse> getTravelInformation(List<QuoteRequest> requestList) {
        List<TravelInformationResponse> responses = new List<TravelInformationResponse>();
        
        for (QuoteRequest req : requestList) {
            Quote quoteInfo = new Quote();
            Integer adults = 0;
            Integer children = 0;
            
            if (req.quoteId != null) {
                quoteInfo = [
                    SELECT TravelStartDate__c, TravelEndDate__c, Total_Passengers__c, 
                    Opportunity.Country_of_Interest__c, Opportunity.Region_of_Interest__c,
                    Opportunity.Activities_of_Interest__c, Opportunity.Level_of_Accommodation__c, Opportunity.Budget_Total_US__c, AccountId, OpportunityId
                    FROM Quote
                    WHERE Id = :req.quoteId
                    LIMIT 1
                ];
                
                List<PassengerQuotationMapping__c> mappings = [
                    SELECT Passenger_Type__c
                    FROM PassengerQuotationMapping__c
                    WHERE Quote__c = :req.quoteId
                ];
                
                
                for (PassengerQuotationMapping__c p : mappings) {
                    if (p.Passenger_Type__c == 'Adult') {
                        adults++;
                    } else if (p.Passenger_Type__c == 'Child') {
                        children++;
                    }
                }
            }           
            
            TravelInformationResponse resp = new TravelInformationResponse();
            resp.startDate = quoteInfo.TravelStartDate__c;
            resp.endDate = quoteInfo.TravelEndDate__c;
            resp.totalPassengers = quoteInfo.Total_Passengers__c;
            resp.numberOfAdults = adults;
            resp.numberOfChildren = children;
            resp.countryOfInterest = quoteInfo.Opportunity.Country_of_Interest__c;
            resp.regionOfInterest = quoteInfo.Opportunity.Region_of_Interest__c;
            resp.activitiesOfInterest = quoteInfo.Opportunity.Activities_of_Interest__c;
            resp.levelOfAccommodation = quoteInfo.Opportunity.Level_of_Accommodation__c;
            resp.totalBudget = quoteInfo.Opportunity.Budget_Total_US__c;
            resp.accountId = quoteInfo.AccountId;
            resp.opportunityId = quoteInfo.OpportunityId;
            
            responses.add(resp);
        }
        return responses;
    }
}