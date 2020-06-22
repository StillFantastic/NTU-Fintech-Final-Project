class Strategy():
    def __setitem__(self, key, value):
        self.options[key] = value

    def __getitem__(self, key):
        return self.options.get(key, "")

    def __init__(self):
        self.subscribedBooks = {
            "Binance": {
                "pairs": ["BTC-USDT"],
            },
        }
        self.options = {}
        self.period = 60 * 15

        # ATR
        self.n = 0
        self.nHistory = []

        # Buy/Sell unit
        self.unit = 0

        # Channel upper bound
        self.donchian_channel_high = 0
        self.donchian_channel_stop_profit = 0

        # Past candles history
        self.history = []

        # Position 
        self.position = 0

        # Last buy price
        self.buyPrice = 0

    def recalc(self, exchange, currency, baseCurrency):
        trueRangeSum = 0
        self.donchian_channel_low = 0
        self.donchian_channel_stop_profit = 10000000000
        if len(self.history) > 82:
            self.history.pop(0)
        if len(self.nHistory) > 79:
            self.nHistory.pop(0)

        preInfo = self.history[80]
        info = self.history[81]
        trueRangeSum += max(info["High"] - info["Low"], info["High"] - preInfo["Close"], preInfo["Close"] - info["Low"])
        for nn in self.nHistory:
            trueRangeSum += nn

        for i in range(80):
            preInfo = self.history[80 - i - 1]
            info = self.history[80 - i]
            self.donchian_channel_high = max(self.donchian_channel_high, info["High"])
            if i < 80:
                self.donchian_channel_stop_profit = min(self.donchian_channel_stop_profit, info["Low"])

        self.n = trueRangeSum / (len(self.nHistory) + 1)
        
        # Minimum volitility
        if (self.n < 80):
            self.n = 80
        self.nHistory.append(self.n)
        
        balance = self["assets"][exchange][currency] * self.history[41]["Close"] + self["assets"][exchange][baseCurrency]

        self.unit = (0.03 * balance) / self.n
        # Log(str(self.n) + " " + str(self.unit))

    def try_open(self):
        if self.position == 0:
            last_price = self.history[81]["Close"]
            if last_price >= self.donchian_channel_high:
                return self.unit
        return 0

    def try_close(self):
        last_price = self.history[81]["Close"]
        if self.position > 0:
            if last_price >= self.buyPrice + 0.5 * self.n:
                return self.unit
            elif last_price <= self.buyPrice - 2 * self.n:
                return -self.position
            elif last_price <= self.donchian_channel_stop_profit:
                return -self.position

        return 0

    def trade(self, information):
        exchange = list(information["candles"])[0]
        pair = list(information["candles"][exchange])[0]
        candleData = information["candles"][exchange][pair][0]
        last_price = candleData["close"]
        currency = pair.split("-")[0]
        baseCurrency = pair.split("-")[1]

        self.history.append({
            "Time": candleData["time"],
            "Open": candleData["open"],
            "Close": candleData["close"],
            "High": candleData["high"],
            "Low": candleData["low"],
        })

        if len(self.history) >= 82:
            self.recalc(exchange, currency, baseCurrency)

            open = self.try_open()
            if open:
                Log(str(open))
                open = min(open, self["assets"][exchange][baseCurrency] / last_price / 1.1)
                # Due to low market depth
                open = min(open, 3)
                self.position = open
                self.buyPrice = last_price
                return [
                    {
                        "exchange": exchange,
                        "amount": open,
                        "price": -1,
                        "type": "MARKET",
                        "pair": pair,
                    }
                ]

            close = self.try_close()
            if close:
                if close > 0:
                    close = min(close, self["assets"][exchange][baseCurrency] / last_price / 1.1)
                    close = min(close, 3)
                    self.buyPrice = last_price
                else:
                    close = max(close, -3)
                self.position += close
                return [
                    {
                        "exchange": exchange,
                        "amount": close,
                        "price": -1,
                        "type": "MARKET",
                        "pair": pair,
                    }
                ]
        return []

