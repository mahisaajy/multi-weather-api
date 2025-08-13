import { Controller, Get, Query } from '@nestjs/common';
import { WeatherService } from './weather.service';

@Controller('weather')
export class WeatherController {
    constructor(private readonly weatherService: WeatherService) {}

    @Get()
    async getWeather(@Query('lat') lat: string, @Query('lon') lon: string) {
        if (!lat || !lon) {
            return { error: 'Missing lat or lon query parameter' };
        }
        return this.weatherService.getAllWeather(lat, lon);
    }
}