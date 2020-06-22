class Turtle {
  trade(information) {
    const exchange = Object.keys(information.candles)[0];
    const pair = Object.keys(information.candles[exchange])[0];
    const baseCurrency = pair.split("-")[1];
    const currency = pair.split("-")[0];
    if (!information.candles[exchange][pair]) return [];
    const candleData = information.candles[exchange][pair][0];

    this.history.push({
      Time: candleData.time,
      Open: candleData.open,
      Close: candleData.close,
      High: candleData.high,
      Low: candleData.low,
      Volumn: candleData.volumn,
    });

    if (this.history.length >= 42) {
      this.recalc(exchange, currency, baseCurrency);

      let open = this.try_open();
      if (open) {
        open = Math.min(open, this.assets[exchange][baseCurrency] / candleData.close / 1.1);
        open = Math.min(open, 3);
        this.position = open;
        this.buyPrice = candleData.close;
        return [
          {
            exchange,
            pair,
            type: "MARKET",
            amount: open,
            price: -1,
          }
        ]
      }
      let close = this.try_close();
      if (close) {
        if (close > 0) {
          close = Math.min(close, this.assets[exchange][baseCurrency] / candleData.close / 1.1);
          close = Math.min(close, 3);
          this.buyPrice = candleData.close;
        } else {
          close = Math.max(close, -3);
        }
        this.position += close;
        return [
          {
            exchange,
            pair,
            type: "MARKET",
            amount: close,
            price: -1,
          }
        ]
      } 
      
    }
    return [];
  }

  // must have, monitoring life cycle of order you made
  onOrderStateChanged(state) {
    Log('onOrderStateChanged');
  }

  constructor() {
    // must have for developer
    this.subscribedBooks = {
      'Binance': {
        pairs: [ 'BTC-USDT' ]
      },
    };

    // seconds for broker to call trade()
    // do not set the frequency below 60 sec.
    // 60 * 30 for 30 mins
    this.period = 60 * 30;

    // must have
    // assets should be set by broker
    this.assets = undefined;

    // customizable properties
    // sell price - buy price

    // ATR
    this.n = 0;
    this.nHistory = [];

    // Buy/Sell unit
    this.unit = 0;

    // Channel upper bound
    this.donchian_channel_high = 0;

    // Channel lower bound
    this.donchian_channel_low = 0;

    // Past candles history
    this.history = [];

    // Position
    this.position = 0; 

    // Last buy price
    this.buyPrice = 0;
  }

  recalc(exchange, currency, baseCurrency) {
    let trueRangeSum = 0;
    let preInfo;
    let info;
    this.donchian_channel_high = 0;
    this.donchian_channel_low = 10000000000;
    this.donchian_channel_stop_profit = 10000000000;
    if (this.nHistory.length > 19) 
      this.nHistory.shift();
    if (this.history.length > 42)
      this.history.shift();

    preInfo = this.history[40];
    info = this.history[41];
    trueRangeSum += Math.max(info.High - info.Low, info.High - preInfo.Close, preInfo.Close - info.Low);
    for (let i = 0; i < this.nHistory.length; i++) 
      trueRangeSum += this.nHistory[i];

    for (let i = 0; i < 40; i++) {
      preInfo = this.history[40 - i - 1];
      info = this.history[40 - i];
      this.donchian_channel_high = Math.max(this.donchian_channel_high, info.High);
      this.donchian_channel_low = Math.min(this.donchian_channel_low, info.Low);
      if (i < 20) {
        this.donchian_channel_stop_profit = Math.min(this.donchian_channel_low, info.Low);
      }
    }

    this.n = trueRangeSum / (this.nHistory.length + 1);
    if (this.n < 40)
      this.n = 40;
    this.nHistory.push(this.n);

    let balance = this.assets[exchange][currency] * this.history[41].Close + this.assets[exchange][baseCurrency];
    this.unit = (0.03 * balance) / this.n;
  }

  try_open() {
    if (this.position == 0) {
      let last_price = this.history[41].Close;
      if (last_price >= this.donchian_channel_high) {
        return this.unit;
      }
    }
    return 0;
  }
  
  try_close() {
    let last_price = this.history[41].Close;
    if (this.position > 0) {
      if (last_price >= this.buyPrice + 0.5 * this.n)
        return this.unit;
      else if (last_price <= this.buyPrice - 2 * this.n)
        return -this.position;
      else if (last_price <= this.donchian_channel_stop_profit)
        return -this.position;
    }
    return 0;
  }
}

